<h1 align="center">
    <img width="600" src="assets/logo.png" align="center"></img>
</h1>
<p align="center">🌎 Anti-Stream Sniping for GeoGuessr.</p>

<p align="center">
  <a aria-label="Download at Chrome Web Store" href="https://chromewebstore.google.com/category/extensions">
    <img src="https://img.shields.io/badge/chrome-in%20review-info?logo=chromewebstore"></img>
  </a>
  <a aria-label="Download at Firefox Add-ons" href="https://addons.mozilla.org/pt-BR/firefox">
    <img src="https://img.shields.io/badge/firefox-in%20review-info?logo=firefoxbrowser"></img>
  </a>
</p>

## 🗺️ GeoStreamr

This is a tool developed to help streamers to play GeoGuessr without showing queueing information (ie. game mode + waiting for opponent overlay). The project now ships both Chrome and Firefox WebExtension builds; publishing to each store is still in progress.

To use this, simply install and click on the extension to open up the Remote Control popup.

| GeoGuessr Duels                  | GeoStreamr Extension             |
| -------------------------------- | -------------------------------- |
| <img src="/assets/screen1.png"/> | <img src="/assets/screen3.png"/> |

### 📱 Remote Control

<p align="left">
  <img width="228px" align="right" src="/assets/screen2.png"/>
</p>

You can also use the buttons in your remote device, as long as you are in the same WiFi.  
When you press connect to remote, you'll have to scan a QRCode to share the controls with your phone. Even when the connection is established keep the extension popup open.

### 🪶 TODO

- [x] Improve README.md (+ images)
- [ ] Make it compatible with multiplayer duels
- [x] Mute "Waiting for Opponent" sound effect
- [x] Freeze avatar
- [ ] Localization
- [x] Make it compatible with Firefox
- [ ] Publish on Chrome Web Store
- [ ] Publish on Firefox Add-ons

### 🤝 Contribute

This repository is currently available for contributions. If you'd like to help, here are more things to know:

1. Clone this repository and load the Chrome build from `extension/chrome` via `chrome://extensions`, or load the Firefox build from `extension/firefox` via `about:debugging#/runtime/this-firefox`.
2. To test for remote control, open a http server at the root directory, you can then change the variables temporarily (such as `QR_BASE_URL`).
3. GeoGuessr stops rendering the avatar when the user is starting a match (waiting for opponent), therefore we have to freeze the avatar before starting.
4. Communication between GeoGuessr and the extension popup is made through the [runtime messages](https://developer.chrome.com/docs/extensions/reference/api/runtime).
5. Communication between the extension and the remote is made through WebRTC: the extension creates an offer and publishes it on the KV (hosted at cloudflare) via HTTP, the remote then queries for the offer and publishes an accept token on the KV. The extension keeps listening to the KV every 3s until the connection is established.
6. If you find any bugs, feel free to report on [issues](https://github.com/MateusAquino/geostreamr/issues).
