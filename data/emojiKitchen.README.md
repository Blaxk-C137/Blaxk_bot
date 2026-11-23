# Emoji Kitchen lookup

`emojiKitchen.json.gz` contains a compact index of 147,000 supported emoji pairs and their Google image URLs. Images are downloaded from Google's CDN only when requested; no API key or third-party mixing API is needed. Variation selectors are normalized, and skin tones use the corresponding base emoji mix.

Source: [Emoji Kitchen metadata](https://emojikitchen.dev/metadata.json), maintained by [xsalazar/emoji-kitchen-backend](https://github.com/xsalazar/emoji-kitchen-backend). Retrieved 23 November 2026. Emoji Kitchen artwork belongs to Google; artwork is not bundled.

To refresh the index, download the source metadata and run:

```sh
node tools/build-emoji-kitchen.cjs /path/to/metadata.json
```
