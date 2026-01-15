# 🌀 Remix DM - The Ultimate Media Downloader

<p align="center">
  <img src="renderer/public/images/logo.png" alt="Remix DM Logo" width="180">
</p>

> **Professional High-Speed Media Downloader** built with Electron, Next.js, yt-dlp and aria2.

<p align="center">
  <img src="https://img.shields.io/badge/Electron-34.0.0-blue?style=for-the-badge&logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/Next.js-14.2.4-black?style=for-the-badge&logo=next.js" alt="Next.js">
  <img src="https://img.shields.io/badge/Tailwind_CSS-4.1.18-38B2AC?style=for-the-badge&logo=tailwind-css" alt="TailwindCSS">
  <img src="https://img.shields.io/badge/yt--dlp-Latest-red?style=for-the-badge&logo=youtube" alt="yt-dlp">
  <img src="https://img.shields.io/badge/aria2-Latest-8a2be2?style=for-the-badge" alt="aria2">
</p>

**Remix DM** is a premium, high-performance desktop application designed to make downloading media from the internet as easy as a single click. Built with Electron, Next.js, and the power of `yt-dlp` & `aria2`, it supports thousands of websites with a beautiful, modern user interface.

---

## ✨ Features

- 🚀 **Universal Support**: Download from YouTube, TikTok, Instagram, Twitter(X), Facebook, Vimeo, Twitch, Dailymotion, and 1000+ other sites.
- 📊 **Real-time Progress**: Track download speed, ETA, and progress percentage with a smooth, live-updating UI.
- 🎞️ **Quality Selection**: Choose your preferred quality from 360p up to 4K (if available).
- 🎵 **Smart Audio**: Download high-quality audio directly (MP3/M4A/FLAC) with auto-organization into the `Audios` directory.
- 📝 **Info Extraction**: See title, duration, uploader, and thumbnails before you even start the download.
- 🎬 **Playlist/Channel**: Download entire playlists or channels from YouTube and Vimeo with a single click.
- 🌀 **Multiple Links**: Add unlimited links to the queue and process them in bulk.
- ⚡ **Concurrent Downloads**: Smart queue management for fast simultaneous downloads (User-configurable up to 5 files).
- 🎛️ **Download Management**: Pause, resume, retry, or cancel downloads with full control.
- 📚 **Smart History**: Auto-grouped by date (Today, Yesterday, etc.), real-time search, file existence checks, and direct file/folder access.
- ⚙️ **Advanced Settings**:
  - **Custom Download Paths**: Change the primary download directory.
  - **Smart Organization**: Files are auto-categorized into `Videos`, `Audios`, `Programs`, etc.
  - **Conflict Management**: Choose what happens when a file exists (Rename, Overwrite, or Skip).
  - **Engine Status**: Real-time status monitor for `yt-dlp`, `Aria2`, and `FFmpeg`.
- 💎 **Premium UI**: Dark-mode-first aesthetic with Glassmorphism effects and smooth Framer Motion animations.
- 🛠️ **Binary Management**: Automatically downloads and updates the latest `yt-dlp` and `aria2` engines in the background.

---

## 🛠️ Tech Stack

- **Framework**: [Nextron](https://github.com/saltyshippo/nextron) (Next.js + Electron)
- **UI Components**: [HeroUI](https://heroui.com/) (formerly NextUI)
- **Styling**: Tailwind CSS v4
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Core Engine**: [yt-dlp](https://github.com/yt-dlp/yt-dlp) & [aria2](https://github.com/aria2/aria2)

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS version recommended)
- [NPM](https://www.npmjs.com/) or [Yarn](https://yarnpkg.com/)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/mramadan18/remix-dm.git
   cd remix-dm
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Run in development mode:

   ```bash
   npm run dev
   ```

4. Build for production:

   ```bash
   npm run build
   ```

   The built application will be available in the `dist/` directory.

---

## 📁 Project Structure

- `main/`: Electron main process files, IPC handlers, and backend services.
  - `services/`: Download services, binary management, and persistent settings service.
  - `ipc/`: Inter-process communication handlers for settings, history, and downloads.
- `renderer/`: Next.js frontend, components, hooks, and styles.
  - `components/`: React components for UI screens and settings modules.
  - `hooks/`: Custom React hooks for download management and centralized settings.
  - `pages/`: Next.js pages and routing.
- `app/`: Compiled Electron application files.
- `resources/`: Application assets and icons.

---

## ⚖️ License

Distributed under the MIT License. See `LICENSE` for more information.

---

<p align="center">
  Developed with ❤️ by <b>mramadan18</b>
</p>
