// A session implementation for h3 based on express-session
import { H3Event, getCookie, setCookie } from 'h3'
import { defu } from 'defu'
import { subtle, randomUUID } from 'uncrypto'
import { Session } from './session'

export type SessionCookieOptions = Parameters<typeof setCookie>[3]

export type SessionCookie = SessionCookieOptions & {
  setSessionId(sid: string): Promise<void>
}

// The session as saved in the store, without any methods added
export type RawSession<SessionDataT> = SessionDataT & {
  cookie?: SessionCookieOptions
}

export interface SessionStore<SessionDataT> {
  all?: () => Promise<RawSession<SessionDataT>[]>
  destroy: (sid: string) => Promise<void>
  clear?: () => Promise<void>
  length?: () => Promise<number>
  get: (sid: string) => Promise<RawSession<SessionDataT> | undefined>
  set: (sid: string, data: RawSession<SessionDataT>) => Promise<void>
  touch: (sid: string, data: SessionDataT) => Promise<void>
}

interface H3SessionOptions<SessionDataT> {
  store: SessionStore<SessionDataT>

  // Settings for configuring the session cookie
  // The default value is { path: '/', httpOnly: true, secure: true, maxAge: null, name: 'connect.sid' }.
  cookie?: {
    domain?: string
    expires?: Date
    httpOnly?: boolean
    maxAge?: number
    path?: string
    sameSite?: true | false | 'lax' | 'none' | 'strict'
    secure?: boolean
  }

  // The name of the session cookie
  name?: string

  // Function to generate session ID. Defaults to randomUUID
  genid: (event: H3Event) => string

  // Function for generating new session data
  generate?: () => SessionDataT

  // proxy?: boolean

  // resave, rolling,
  saveUninitialized: boolean

  secret: string | string[]

  // unset: 'destroy' | 'keep'
}

/**
 * Verify that a cookie was signed with one of the secrets
 * If it's valid, return the embedded message
 *
 * @param value a cookie value in the format `s:[value].[signature]`
 * @param secrets an array of secret strings to verify with
 */
async function unsignCookie(
  value: string,
  secrets: string[],
): Promise<string | false> {
  // Validate cookie format
  const matches = /s:([^.]*)\.(.*)/.exec(value)
  if (!matches) {
    return false
  }

  const [, message, signature] = matches

  const encoder = new TextEncoder()

  const messageUint8Array = encoder.encode(message)

  const signatureUint8Array = Uint8Array.from(Buffer.from(signature, 'base64'))

  for (let i = 0; i < secrets.length; i++) {
    const keyUint8Array = encoder.encode(secrets[i])
    const cryptoKey = await subtle.importKey(
      'raw',
      keyUint8Array,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )

    const result = await subtle.verify(
      'HMAC',
      cryptoKey,
      signatureUint8Array,
      messageUint8Array,
    )

    if (result) {
      return message
    }
  }

  return false
}

/**
 * Creates a signed cookie value in the format `s:[value].[signature]`
 * @param value
 * @param secret
 */
async function signCookie(value: string, secret: string): Promise<string> {
  // Convert the value and secret to Uint8Array
  const encoder = new TextEncoder()
  const messageUint8Array = encoder.encode(value)
  const keyUint8Array = encoder.encode(secret)

  // Import the secret as a CryptoKey
  const cryptoKey = await subtle.importKey(
    'raw',
    keyUint8Array,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await subtle.sign('HMAC', cryptoKey, messageUint8Array)

  // Encode in base64
  const b64Signature = Buffer.from(signature)
    .toString('base64')
    .replace(/=+$/, '')

  return `s:${value}.${b64Signature}`
}

/**
 * Attach a session to an H3Event
 * @param event
 * @param config
 */
export async function useSession<SessionDataT = any>(
  event: H3Event,
  config: H3SessionOptions<SessionDataT>,
) {
  // Skip if session is already attached
  if (event.context.session) {
    return
  }

  // Populate default config values
  const sessionConfig = defu(config, {
    name: 'connect.sid',
    genid: (_event: H3Event) => {
      return randomUUID()
    },
    generate: () => ({}) as SessionDataT,
    cookie: { path: '/', httpOnly: true, secure: true, maxAge: null },
    saveUninitialized: false,
  })

  const { store } = sessionConfig

  if (!store) {
    throw new Error('[h3-session] Session store is required!')
  }

  if (!sessionConfig.secret) {
    throw new Error('[h3-session] Session secret is required!')
  }

  const generate = async () => {
    return await Promise.resolve({
      id: sessionConfig.genid(event),
      data: sessionConfig.generate(),
    })
  }

  const createSessionCookie = async (
    sid: string,
    data: RawSession<SessionDataT>,
  ): Promise<SessionCookie> => {
    let signedCookie: string

    const cookie = {
      ...sessionConfig.cookie,
      // Default to a max age of one day
      maxAge: sessionConfig.cookie.maxAge || 60 * 60 * 24,
      // Copy cookie properties from the saved session
      ...data.cookie,
      setSessionId: async (sid: string) => {
        signedCookie = await signCookie(
          sid,
          normalizedSecrets[normalizedSecrets.length - 1],
        )
        setCookie(event, sessionConfig.name, signedCookie, cookie)
      },
    }

    await cookie.setSessionId(sid)

    // Update the Set-Cookie header whenever a property on the cookie object changes
    // We can't hook into the onBeforeResponse, so this is the best alternative
    return new Proxy(cookie, {
      set(target, property, value) {
        // @ts-ignore
        target[property] = value
        setCookie(event, sessionConfig.name, signedCookie, cookie)
        return true
      },
    })
  }

  // Secret can be a string or array, normalize to an array
  const normalizedSecrets = Array.isArray(sessionConfig.secret)
    ? sessionConfig.secret
    : [sessionConfig.secret]

  // Check the request for a session cookie
  const rawCookie = getCookie(event, sessionConfig.name)

  // Extract the ID from the cookie
  let sessionId = rawCookie
    ? await unsignCookie(rawCookie, normalizedSecrets)
    : null

  // Load the session data from the store
  let sessionData: RawSession<SessionDataT> | undefined

  if (sessionId) {
    sessionData = await store.get(sessionId)
  }

  // Create the session data and a new ID if it does not exist
  if (!sessionId || !sessionData) {
    const { id, data } = await generate()
    sessionId = id
    sessionData = { ...data, cookie: undefined }
    if (sessionConfig.saveUninitialized) {
      await store.set(sessionId, sessionData)
    }
  } else if (store.touch) {
    // touch existing sessions to refresh their TTLs
    await store.touch(sessionId, sessionData)
  }

  const cookie = await createSessionCookie(sessionId, sessionData)

  // Build a session object with the session data
  const session = new Session<SessionDataT>(
    sessionId,
    sessionData,
    store,
    generate,
    cookie,
  )

  // Set session on event context
  event.context.session = session
  event.context.sessionId = sessionId
  // expose session store
  event.context.sessionStore = store

  // TODO: Auto-save the session at the end of the request
  // Depends on h3 1.8.0
  // Needs to be registered in nuxt options?
  // https://github.com/unjs/h3/pull/482
  // onAfterResponse(async () => {
  //   // check for changes?
  //   await session.save()
  // })
}

export * from './session'
export * from './unstorage-store'
