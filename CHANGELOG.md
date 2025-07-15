# @scayle/h3-session

## 0.6.1

### Patch Changes

- Disallow setting `name`, `path` or `domain` on the session cookie. Setting these properties would result in a new cookie rather than updating the existing cookie. It is now blocked to prevent unexpected behavior.

## 0.6.0

### Minor Changes

- [Performance] Reduce the calls to `importKey` to improve performance.

## 0.5.1

### Patch Changes

- When a sessionID exists, but there is no session data, re-use the sessionID instead of generating both new data and a new ID. This enables proper functioning of the `saveUninitialized` configuration.
- Fix the `clear()` method on `UnstorageSessionStore` not clearing sessions

## 0.5.0

### Minor Changes

- Cookie metadata is no longer saved in the session store. Previously, `h3-session` stored a copy of the cookie settings in the session store alongside the session data. This has been changed and now only the session data itself is stored. The cookie settings can still be read and manipulated from the `Session` object.

### Patch Changes

- Removed dependency `zod@^3.23.8`
- Replace regex used for cookie parsing

## 0.4.2

### Patch Changes

- Build the package with `unbuild`

## 0.4.1

### Patch Changes

- Updated dependency `defu@6.1.4` to `defu@^6.1.4`
- Updated dependency `uncrypto@0.1.3` to `uncrypto@^0.1.3`
- Updated dependency `unstorage@1.10.2` to `unstorage@^1.10.2`
- Updated dependency `zod@3.23.5` to `zod@^3.23.8`

## 0.4.0

### Minor Changes

- Export the `unsignCookie` utility function

## 0.3.6

### Patch Changes

- Format code with dprint

## 0.3.5

### Patch Changes

- Update to `h3@1.10.1` (_For detailed changes see [Release Notes for unjs/h3 v1.10.0](https://github.com/unjs/h3/releases/tag/v1.10.0)_)

## 0.3.4

### Patch Changes

- Add license file

## 0.3.3

### Patch Changes

- New cookie settings should apply to existing cookies

## 0.3.2

### Patch Changes

- Fix loading sessions created by express-session

## 0.3.1

### Patch Changes

- raise required h3 peerDependency version to v1.8.0 and use only fixed dependencies

## 0.3.0

### Minor Changes

- Support typing the session data

### Patch Changes

- Remove unused proxy option

## 0.2.1

### Patch Changes

- Bump the compilation target to ES2022

## 0.2.0

### Minor Changes

- Add h3-session package
