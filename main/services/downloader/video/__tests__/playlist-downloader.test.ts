import { PlaylistDownloader } from "../playlist-downloader";
import { getYtDlpWrap } from "../../../utils/binary-manager";

// Mock electron
jest.mock("electron", () => ({
  app: {
    getPath: jest.fn().mockReturnValue("/mock/downloads"),
  },
  dialog: {},
}));

jest.mock("../../../utils/binary-manager", () => ({
  getYtDlpWrap: jest.fn(),
  ensureYtDlp: jest.fn().mockResolvedValue(true),
}));

describe("PlaylistDownloader", () => {
  let downloader: PlaylistDownloader;

  beforeEach(() => {
    jest.clearAllMocks();
    downloader = new PlaylistDownloader();
  });

  describe("getPlaylistMetadata", () => {
    it("should correctly parse playlist metadata", async () => {
      const mockYtDlp = {
        execPromise: jest.fn().mockResolvedValue(
          JSON.stringify({
            _type: "playlist",
            id: "pl123",
            title: "Test Playlist",
            entries: [
              { id: "vid1", title: "Video 1", url: "https://v1" },
              { id: "vid2", title: "Video 2", url: "https://v2" },
            ],
            extractor: "youtube",
          }),
        ),
      };
      (getYtDlpWrap as jest.Mock).mockReturnValue(mockYtDlp);

      const result = await downloader.getPlaylistMetadata(
        "https://playlist.url",
      );

      expect(result.success).toBe(true);
      expect(result.data?.isPlaylist).toBe(true);
      expect(result.data?.playlist?.videoCount).toBe(2);
      expect(result.data?.playlist?.videos[0].title).toBe("Video 1");
    });

    it("should correctly parse Vimeo showcase/playlist metadata", async () => {
      const mockYtDlp = {
        execPromise: jest.fn().mockResolvedValue(
          JSON.stringify({
            _type: "playlist",
            id: "vimeo123",
            title: "Vimeo Collection",
            entries: [
              { id: "v1", title: "Cinematic Clip", url: "https://vimeo.com/1" },
            ],
            extractor: "vimeo:album",
          }),
        ),
      };
      (getYtDlpWrap as jest.Mock).mockReturnValue(mockYtDlp);

      const result = await downloader.getPlaylistMetadata(
        "https://vimeo.com/showcase/123",
      );

      expect(result.success).toBe(true);
      expect(result.data?.extractor).toBe("vimeo:album");
      expect(result.data?.playlist?.videos.length).toBe(1);
    });

    it("should handle errors", async () => {
      const mockYtDlp = {
        execPromise: jest.fn().mockRejectedValue(new Error("Failed to fetch")),
      };
      (getYtDlpWrap as jest.Mock).mockReturnValue(mockYtDlp);

      const result = await downloader.getPlaylistMetadata(
        "https://playlist.url",
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to fetch");
    });
  });

  describe("preparePlaylistVideoTasks", () => {
    it("should create individual tasks from playlist entries", () => {
      const videoInfo = {
        playlist: {
          videos: [
            { id: "v1", title: "V1", url: "https://v1" },
            { id: "v2", title: "V2", url: "https://v2" },
          ],
        },
      } as any;
      const baseOptions = { outputPath: "C:/Downloads" } as any;

      const tasks = downloader.preparePlaylistVideoTasks(
        videoInfo,
        baseOptions,
      );

      expect(tasks.length).toBe(2);
      expect(tasks[0].options.url).toBe("https://v1");
      expect(tasks[1].options.url).toBe("https://v2");
    });
  });
});
