# Glyph source fonts (build-time only)

These TTFs are **not** served at runtime. They are the fallback source used by
[`../build-map-glyphs.mjs`](../build-map-glyphs.mjs) to fill the Greek / Cyrillic / extended-Latin
glyphs that **Public Sans lacks**, merging them into the self-hosted
`static/fonts/maplibre/Public Sans {Regular,Bold,Italic}/` glyph stacks.

Without this, non-Latin city labels (Athens in Greek, Belgrade and Kyiv in Cyrillic) render as
`.notdef` tofu boxes.

## Files

`NotoSans-Regular.ttf`, `NotoSans-Bold.ttf` and `NotoSans-Italic.ttf` are Noto Sans
(Latin/Greek/Cyrillic), from https://github.com/googlefonts/noto-fonts (`unhinted/ttf/NotoSans`).

## License

Noto Sans is licensed under the **SIL Open Font License 1.1** (OFL).
Copyright 2022 The Noto Project Authors (https://github.com/notofonts/latin-greek-cyrillic).
Full text: https://openfontlicense.org/

To regenerate the glyph stacks after changing these fonts:

```
pnpm build:glyphs
```
