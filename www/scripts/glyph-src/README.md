# Glyph source fonts (build-time only)

These TTFs are **not** served at runtime. They are the fallback source used by
[`../build-map-glyphs.mjs`](../build-map-glyphs.mjs) to fill the Greek, Cyrillic and extended-Latin
glyphs that **Public Sans lacks**, merging them into the self-hosted
`static/fonts/maplibre/Public Sans {Regular,Bold,Italic}/` glyph stacks.

Without this, non-Latin city labels (Athens in Greek, Belgrade and Kyiv in Cyrillic) render as
`.notdef` tofu boxes.

## Files

`NotoSans-Regular.ttf`, `NotoSans-Bold.ttf` and `NotoSans-Italic.ttf` are Noto Sans (Latin, Greek,
Cyrillic), version 2.008, unmodified from `unhinted/ttf/NotoSans/` in
[notofonts/noto-fonts](https://github.com/notofonts/noto-fonts) (formerly `googlefonts/noto-fonts`,
now archived). Noto Sans development continues in
[notofonts/latin-greek-cyrillic](https://github.com/notofonts/latin-greek-cyrillic).

## Licence

Noto Sans is licensed under the **SIL Open Font License 1.1** (OFL). Copyright 2015–2022 Google
LLC. Full text: https://openfontlicense.org/

## Regenerating the glyph stacks

After changing these fonts, rebuild the stacks from `www/` and commit the changed PBFs under
`static/fonts/maplibre/`:

```sh
pnpm build:glyphs
```

The script merges into those PBFs in place, and a glyph already in a PBF wins over the Noto one.
A re-run therefore only fills codepoints that are still missing; replacing glyphs an earlier run
merged needs unmerged Public Sans PBFs to start from.

The site serves the committed stacks with its own build. The copy that external consumers of the
published map style load lives on the tiles host, so the maintainers then run
`pnpm deploy:mapstyle` (needs SSH access to the server), as
[DEPLOY_TILES.md](../../DEPLOY_TILES.md) describes.
