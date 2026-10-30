# Embla Carousel 8.6.0

Vendored browser ESM build from the pinned npm package [embla-carousel@8.6.0](https://www.npmjs.com/package/embla-carousel/v/8.6.0). Upstream: https://github.com/davidjerleke/embla-carousel/tree/v8.6.0. Licensed under MIT; see LICENSE.

- npm tarball integrity: sha512-SjWyZBHJPbqxHOzckOfo8lHisEaJWmwd23XppYFYVh10bU66/Pn5tkVkbkCMZVdbUE5eTCI2nD8OyIP4Z+uwkA==
- Served ESM SHA-256: 8ef265760a895ecdf814d7c79dec3f1980a2d8ce06d7fed84d38317d40f02db8
- The trailing sourceMappingURL comment is removed because the source map is not served. No library behavior is modified.

To reproduce, run npm ci at the repository root, copy node_modules/embla-carousel/esm/embla-carousel.esm.js here, remove its sourceMappingURL comment, and retain the upstream v8.6.0 LICENSE. The site imports this local file directly; deployment needs no npm build step or CDN.
