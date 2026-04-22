# Third-Party Licenses

This document lists third-party dependencies used in DEXrp and their respective licenses.

## License Summary

All production dependencies use permissive open-source licenses that are compatible with the Sustainable Use License:

| License Type | Package Count |
|-------------|---------------|
| MIT | 711 |
| ISC | 91 |
| Apache-2.0 | 23 |
| BlueOak-1.0.0 | 10 |
| BSD-3-Clause | 9 |
| MPL-2.0 | 5 |
| BSD-2-Clause | 5 |
| Unlicense | 2 |
| CC-BY-4.0 | 1 |
| 0BSD | 1 |

## Dual-Licensed Packages

### jszip

- **Package**: jszip@3.10.1
- **Available Licenses**: MIT OR GPL-3.0-or-later
- **License Used**: MIT
- **Repository**: https://github.com/Stuk/jszip

This package is dual-licensed. DEXrp uses jszip under the MIT license terms.

## MPL-2.0 Licensed Packages

The following packages are licensed under the Mozilla Public License 2.0. These packages are used unmodified. MPL-2.0 is a file-level copyleft license; modifications to these specific files (if any) must be shared under MPL-2.0 terms.

- **@ethereumjs/rlp@5.0.2** - https://github.com/ethereumjs/ethereumjs-monorepo
- **@ethereumjs/util@9.1.0** - https://github.com/ethereumjs/ethereumjs-monorepo
- **lightningcss@1.30.2** - https://github.com/parcel-bundler/lightningcss

## Major Dependencies

### XRPL JavaScript Library
- **Package**: xrpl
- **License**: ISC
- **Repository**: https://github.com/XRPLF/xrpl.js

### Keystone Hardware Wallet SDK
- **Packages**: @keystonehq/keystone-sdk, @keystonehq/bc-ur-registry
- **License**: MIT
- **Repository**: https://github.com/KeystoneHQ

### React
- **Package**: react, react-dom
- **License**: MIT
- **Repository**: https://github.com/facebook/react

### Radix UI (shadcn/ui components)
- **Packages**: @radix-ui/*
- **License**: MIT
- **Repository**: https://github.com/radix-ui/primitives

### TanStack Query
- **Package**: @tanstack/react-query
- **License**: MIT
- **Repository**: https://github.com/TanStack/query

### Tailwind CSS
- **Package**: tailwindcss
- **License**: MIT
- **Repository**: https://github.com/tailwindlabs/tailwindcss

## Complete License List

To generate a complete list of all dependency licenses, run:

```bash
npx license-checker --production --csv
```

---

Last updated: 2025-12-14
