# 🌀 RemixDM — The Elite Media Downloader

<p align="center">
  <img src="renderer/public/images/logo.png" alt="Remix DM Logo" width="160">
</p>

<p align="center">
  <b>A professional-grade desktop application for lightning-fast media downloads.</b><br>
  Built with Electron 34, Next.js 14, and powered by industry-leading open-source engines.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.0--beta.4-FF4B5C?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/Electron-34.0.0-blue?style=for-the-badge&logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/Next.js-14.2.4-black?style=for-the-badge&logo=next.js" alt="Next.js">
  <img src="https://img.shields.io/badge/HeroUI-2.8.7-611FEE?style=for-the-badge&logo=nextui" alt="HeroUI">
</p>

---

## 🚀 Overview

**RemixDM** is a premium, high-performance media acquisition tool designed for those who demand speed, reliability, and aesthetics. By combining the raw power of `yt-dlp` and `aria2` with a stunning modern interface, RemixDM makes downloading 4K videos, massive file archives, and watermark-free social media content effortless.

---

## ✨ Key Features

### 💎 Next-Gen User Interface

- **Glassmorphism Sidebar**: A sleek, 100px slim sidebar with vertical icon layouts and dynamic glow effects.
- **Modern Update Center**: A dedicated Software Update hub inspired by macOS/Windows update centers for both the app and its engines.
- **Interactive Animations**: Powered by Framer Motion for buttery-smooth transitions and micro-interactions.
- **Smart Dark Mode**: Optimized theme support using HeroUI for a premium low-light experience.

### ⚡ Power-User Download Engine

- **Multi-Protocol Support**: Seamlessly handle YouTube, TikTok (no watermark), Instagram, Twitter(X), Facebook, and 1000+ other sites.
- **Aria2 Acceleration**: Multi-connection downloads for maximum bandwidth utilization.
- **Smart User-Agent Spoofing**: Automatic detection and bypass for sites like Arabseed to ensure valid metadata and file sizes.
- **Deep Linking**: Trigger downloads directly from your browser via `remixdm://` protocol handling.

### 🛠️ Advanced Management

- **Single Instance Performance**: The app intelligently prevents multiple instances, focusing your active window automatically.
- **Auto-Binary Updates**: Never worry about broken downloaders; RemixDM automatically keeps `yt-dlp` and `aria2` up to date.
- **Real-time Monitoring**: Detailed dashboard showing speed, ETA, engine statuses (FFmpeg/Aria2), and download progress.
- **Configurable Queue**: Control concurrent downloads and manage your history with ease.

---

## 🛠️ Tech Stack

- **Framework**: [Nextron](https://github.com/saltyshippo/nextron) (Next.js 14 App Router + Electron)
- **UI Architecture**: [HeroUI](https://heroui.com/) Components
- **Styling**: Tailwind CSS v4 (with PostCSS)
- **Animations**: Framer Motion 12
- **Core Engines**: [yt-dlp](https://github.com/yt-dlp/yt-dlp), [aria2](https://github.com/aria2/aria2), and [FFmpeg](https://ffmpeg.org/).
- **Persistence**: `electron-store` for settings and `nedb`-style persistence for download history.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- `npm` or `yarn`

### Installation & Development

1. **Clone & Enter**:
   ```bash
   git clone https://github.com/mramadan18/remix-dm.git
   cd remix-dm
   ```
2. **Setup Dependencies**:
   ```bash
   npm install
   ```
3. **Launch Dev Environment**:
   ```bash
   npm run dev
   ```

### Production Build

Create a production-ready, optimized installer for your platform:

```bash
npm run build
```

The resulting installer will be available in the `dist/` directory.

---

## 📁 Repository Structure

| Path              | Responsibility                                                  |
| :---------------- | :-------------------------------------------------------------- |
| `main/`           | Electron main process: IPC handlers, system services.           |
| `main/services/`  | Core logic: Downloaders, update service, settings, and history. |
| `renderer/`       | Next.js frontend: Pages, components, and global styles.         |
| `renderer/hooks/` | Custom hooks for state management and IPC bridge logic.         |
| `resources/`      | Branding assets, icons, and static binaries.                    |

---

## 🤝 Support & Feedback

We're constantly improving RemixDM!

- **In-App Support**: Use the built-in **Chatwoot widget** for direct communication.
- **GitHub Issues**: Found a bug? [Open an issue](https://github.com/mramadan18/remix-dm/issues).

---

## ⚖️ License

Distributed under the MIT License. See `LICENSE` for more information.

<p align="center">
  Crafted with ❤️ by <a href="https://github.com/mramadan18"><b>Mahmoud Ramadan</b></a>
</p>
