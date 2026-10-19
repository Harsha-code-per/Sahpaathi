# Icons

Sources: `logo.svg` (app icon tile), `logo-maskable.svg` (full-bleed, mark inside the 80 % safe zone), `favicon.svg` (transparent mark; ink on light tabs, marigold on dark). The PNGs are rendered from them and committed. After changing a source, run from `app/public/`:

```sh
rsvg-convert -w 192 logo.svg -o icon-192.png
rsvg-convert -w 512 logo.svg -o icon-512.png
rsvg-convert -w 512 logo-maskable.svg -o icon-512-maskable.png
rsvg-convert -w 180 logo-maskable.svg -o apple-touch-icon.png
# PNG favicons cannot switch colour: marigold reads on light and dark tabs
for s in 16 32; do sed 's/#172524/#F4B23E/g' favicon.svg | rsvg-convert -w $s -o favicon-$s.png; done
```
