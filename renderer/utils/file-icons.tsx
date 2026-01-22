import {
  File,
  FileVideo,
  Music,
  Archive,
  FileText,
  Package,
} from "lucide-react";

/**
 * Get appropriate icon component and className for file type
 */
export const getFileIconProps = (type?: string) => {
  switch (type) {
    case "video":
      return { Icon: FileVideo, className: "text-primary" };
    case "audio":
      return { Icon: Music, className: "text-secondary" };
    case "compressed":
      return { Icon: Archive, className: "text-warning" };
    case "document":
      return { Icon: FileText, className: "text-info" };
    case "program":
      return { Icon: Package, className: "text-success" };
    default:
      return { Icon: File, className: "text-default-500" };
  }
};

/**
 * Get file type from filename extension
 */
export const getFileTypeFromExtension = (
  filename: string,
): "video" | "audio" | "compressed" | "document" | "program" | "file" => {
  if (!filename) return "file";

  const extension = filename.split(".").pop()?.toLowerCase();

  // Video extensions
  if (
    ["mp4", "avi", "mkv", "mov", "wmv", "flv", "webm", "m4v"].includes(
      extension || "",
    )
  ) {
    return "video";
  }

  // Audio extensions
  if (
    ["mp3", "wav", "flac", "aac", "ogg", "wma", "m4a"].includes(extension || "")
  ) {
    return "audio";
  }

  // Compressed files
  if (
    ["zip", "rar", "7z", "tar", "gz", "bz2", "xz"].includes(extension || "")
  ) {
    return "compressed";
  }

  // Documents
  if (["pdf", "doc", "docx", "txt", "rtf", "odt"].includes(extension || "")) {
    return "document";
  }

  // Programs/Executables
  if (
    ["exe", "msi", "dmg", "pkg", "deb", "rpm", "appimage"].includes(
      extension || "",
    )
  ) {
    return "program";
  }

  return "file";
};
