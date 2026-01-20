import { detectLinkType } from "../url-detection.service";
import * as https from "https";
import * as http from "http";
import { EventEmitter } from "events";

jest.mock("https");
jest.mock("http");
jest.mock("dns", () => ({
  promises: {
    lookup: jest.fn().mockResolvedValue({ address: "8.8.8.8" }),
  },
}));

describe("UrlDetectionService", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock for request to prevent hanging
    const mockReq = new EventEmitter() as any;
    mockReq.end = jest.fn();
    (https.request as jest.Mock).mockReturnValue(mockReq);
    (http.request as jest.Mock).mockReturnValue(mockReq);
  });

  it("should detect YouTube as a non-direct link", async () => {
    const result = await detectLinkType("https://www.youtube.com/watch?v=123");
    expect(result.isDirect).toBe(false);
    expect(result.reason).toBe("Known video platform");
  });

  it("should detect direct MP4 link via extension fallback when HEAD fails", async () => {
    const mockReq = new EventEmitter() as any;
    mockReq.end = jest.fn();
    (https.request as jest.Mock).mockImplementation((opts, cb) => {
      setTimeout(
        () => mockReq.emit("error", new Error("Connection refused")),
        10,
      );
      return mockReq;
    });

    const result = await detectLinkType("https://example.com/video.mp4");

    expect(result.isDirect).toBe(true);
    expect(result.filename).toBe("video.mp4");
  });

  it("should detect direct download via Content-Type header", async () => {
    const mockRes = new EventEmitter() as any;
    mockRes.statusCode = 200;
    mockRes.headers = {
      "content-type": "application/zip",
      "content-length": "1024",
    };

    const mockReq = new EventEmitter() as any;
    mockReq.end = jest.fn();
    (https.request as jest.Mock).mockImplementation((options, callback) => {
      setTimeout(() => callback(mockRes), 10);
      return mockReq;
    });

    const result = await detectLinkType("https://example.com/file.zip");

    expect(result.isDirect).toBe(true);
    expect(result.contentType).toBe("application/zip");
    expect(result.reason).toBe("Content-Type indicates direct download");
  });

  it("should handle forced video mode", async () => {
    const result = await detectLinkType(
      "https://example.com/file.mp4",
      "video",
    );
    expect(result.isDirect).toBe(false);
    expect(result.reason).toBe("Forced video mode");
  });
});
