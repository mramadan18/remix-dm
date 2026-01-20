import { SingleVideoDownloader } from "../single-video-downloader";
import { getYtDlpWrap, ensureYtDlp } from "../../../utils/binary-manager";
import { DownloadQuality } from "../../types";

// Mock electron
jest.mock("electron", () => ({
  app: {
    getPath: jest.fn().mockReturnValue("/mock/downloads"),
  },
  dialog: {},
}));

// Mock dependencies
jest.mock("../../../utils/binary-manager", () => ({
  getYtDlpWrap: jest.fn(),
  ensureYtDlp: jest.fn().mockResolvedValue(true),
  getFfmpegPath: jest.fn().mockReturnValue("/mock/ffmpeg"),
  isFfmpegAvailable: jest.fn().mockReturnValue(true),
}));

jest.mock("../../../settings.service", () => ({
  settingsService: {
    getSettings: jest.fn().mockReturnValue({
      onFileExists: "overwrite",
    }),
  },
}));

describe("SingleVideoDownloader", () => {
  let downloader: SingleVideoDownloader;

  beforeEach(() => {
    jest.clearAllMocks();
    downloader = new SingleVideoDownloader();
  });

  describe("getVideoMetadata", () => {
    it("should correctly fetch and parse YouTube video metadata", async () => {
      const mockYtDlp = {
        execPromise: jest.fn().mockResolvedValue(
          JSON.stringify({
            id: "v123",
            title: "Testing YouTube",
            duration: 120,
            formats: [
              {
                format_id: "137",
                ext: "mp4",
                resolution: "1920x1080",
                vcodec: "avc1",
                acodec: "none",
                tbr: 2500,
              },
              {
                format_id: "140",
                ext: "m4a",
                vcodec: "none",
                acodec: "mp4a",
                tbr: 128,
              },
            ],
            webpage_url: "https://youtube.com/watch?v=v123",
            extractor: "youtube",
            extractor_key: "Youtube",
          }),
        ),
      };
      (getYtDlpWrap as jest.Mock).mockReturnValue(mockYtDlp);

      const result = await downloader.getVideoMetadata(
        "https://youtube.com/watch?v=v123",
      );

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe("v123");
      expect(result.data?.title).toBe("Testing YouTube");
      expect(result.data?.qualityOptions).toBeDefined();

      // Check if 1080p option was created
      const opt1080 = result.data?.qualityOptions?.find(
        (o) => o.key === "1080p",
      );
      expect(opt1080).toBeDefined();
      expect(opt1080?.label).toContain("1080p");
    });

    it("should correctly parse TikTok video metadata", async () => {
      const mockYtDlp = {
        execPromise: jest.fn().mockResolvedValue(
          JSON.stringify({
            id: "7123456789",
            title: "TikTok Viral Dance",
            duration: 15,
            formats: [
              {
                format_id: "download",
                ext: "mp4",
                resolution: "720x1280",
                vcodec: "h264",
                acodec: "aac",
                tbr: 1500,
              },
            ],
            webpage_url: "https://www.tiktok.com/@user/video/7123456789",
            extractor: "TikTok",
            extractor_key: "TikTok",
          }),
        ),
      };
      (getYtDlpWrap as jest.Mock).mockReturnValue(mockYtDlp);

      const result = await downloader.getVideoMetadata(
        "https://www.tiktok.com/@user/video/7123456789",
      );

      expect(result.success).toBe(true);
      expect(result.data?.extractor).toBe("TikTok");
      expect(result.data?.qualityOptions?.some((o) => o.key === "1280p")).toBe(
        true,
      );
    });

    it("should correctly parse Facebook video metadata", async () => {
      const mockYtDlp = {
        execPromise: jest.fn().mockResolvedValue(
          JSON.stringify({
            id: "fb987654",
            title: "Facebook Live Replay",
            formats: [
              {
                format_id: "hd",
                ext: "mp4",
                resolution: "1280x720",
                vcodec: "avc1",
                acodec: "mp4a",
                tbr: 2000,
              },
              {
                format_id: "sd",
                ext: "mp4",
                resolution: "640x360",
                vcodec: "avc1",
                acodec: "mp4a",
                tbr: 800,
              },
            ],
            webpage_url: "https://www.facebook.com/video/1234",
            extractor: "facebook",
            extractor_key: "Facebook",
          }),
        ),
      };
      (getYtDlpWrap as jest.Mock).mockReturnValue(mockYtDlp);

      const result = await downloader.getVideoMetadata(
        "https://www.facebook.com/video/1234",
      );

      expect(result.success).toBe(true);
      expect(result.data?.extractor).toBe("facebook");
      expect(result.data?.qualityOptions?.length).toBeGreaterThan(0);
    });

    it("should correctly parse Instagram video metadata", async () => {
      const mockYtDlp = {
        execPromise: jest.fn().mockResolvedValue(
          JSON.stringify({
            id: "inst123",
            title: "Instagram Reel",
            formats: [
              {
                format_id: "0",
                ext: "mp4",
                resolution: "1080x1350",
                vcodec: "h264",
                acodec: "aac",
              },
            ],
            webpage_url: "https://www.instagram.com/reel/123/",
            extractor: "Instagram",
            extractor_key: "Instagram",
          }),
        ),
      };
      (getYtDlpWrap as jest.Mock).mockReturnValue(mockYtDlp);

      const result = await downloader.getVideoMetadata(
        "https://www.instagram.com/reel/123/",
      );

      expect(result.success).toBe(true);
      expect(result.data?.extractor).toBe("Instagram");
    });

    it("should handle errors when yt-dlp fails", async () => {
      const mockYtDlp = {
        execPromise: jest.fn().mockRejectedValue(new Error("Network error")),
      };
      (getYtDlpWrap as jest.Mock).mockReturnValue(mockYtDlp);

      const result = await downloader.getVideoMetadata("https://invalid.url");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });
  });

  describe("processQualityOptions", () => {
    it("should group video and audio formats correctly", () => {
      const formats = [
        {
          formatId: "v1080",
          extension: "mp4",
          resolution: "1920x1080",
          quality: "1080p",
          hasVideo: true,
          hasAudio: false,
          tbr: 5000,
        } as any,
        {
          formatId: "v720",
          extension: "mp4",
          resolution: "1280x720",
          quality: "720p",
          hasVideo: true,
          hasAudio: false,
          tbr: 2500,
        } as any,
        {
          formatId: "a128",
          extension: "m4a",
          resolution: null,
          quality: "audio",
          hasVideo: false,
          hasAudio: true,
          tbr: 128,
        } as any,
      ];

      const options = downloader.processQualityOptions(formats, 100);

      expect(options.length).toBe(3); // 1080p, 720p, and Audio Only
      expect(options[0].key).toBe("1080p");
      expect(options[2].key).toBe("bestaudio");
    });
  });

  describe("buildArgs", () => {
    it("should build correct arguments for 1080p download", () => {
      const options = {
        url: "https://youtube.com/watch?v=123",
        quality: "1080p",
        outputPath: "C:/Downloads",
      } as any;

      const args = downloader.buildArgs(options, "output.mp4");

      expect(args).toContain("-o");
      expect(args).toContain("output.mp4");
      expect(args).toContain(
        "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
      );
    });

    it("should add ffmpeg location if available", () => {
      const options = { url: "https://test.com" } as any;
      const args = downloader.buildArgs(options, "out.mp4");

      expect(args).toContain("--ffmpeg-location");
      expect(args).toContain("/mock/ffmpeg");
    });
  });
});
