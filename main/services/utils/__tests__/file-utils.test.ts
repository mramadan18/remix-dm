import { getCategoryByExtension } from "../file-utils";

// Mock electron
jest.mock("electron", () => ({
  app: {
    getPath: jest.fn().mockReturnValue("/mock/downloads"),
  },
}));

describe("File Utils - getCategoryByExtension", () => {
  test("should categorize .mp4 as videos", () => {
    expect(getCategoryByExtension("movie.mp4")).toBe("videos");
  });

  test("should categorize .mp3 as audios", () => {
    expect(getCategoryByExtension("song.mp3")).toBe("audios");
  });

  test("should return others for unknown extensions", () => {
    expect(getCategoryByExtension("data.unknown")).toBe("others");
  });
});
