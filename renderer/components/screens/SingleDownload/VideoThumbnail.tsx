import { FileVideo, User } from "lucide-react";
import { formatDuration } from "../../../utils/formatters";
import { VideoInfo } from "../../../types/download";
import Image from "next/image";

export const VideoThumbnail = ({
  thumbnail,
  duration,
  isLive,
  uploader,
}: VideoInfo) => {
  return (
    <div className="md:col-span-1">
      <div className="relative aspect-video rounded-xl overflow-hidden shadow-lg group bg-default-100">
        {thumbnail ? (
          <Image
            alt="Video Thumbnail"
            src={thumbnail}
            width={500}
            height={500}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FileVideo size={48} className="text-primary" />
          </div>
        )}
        {duration && (
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded-md font-medium">
            {formatDuration(duration)}
          </div>
        )}
        {isLive && (
          <div className="absolute top-2 left-2 bg-red-600 text-white text-xs px-2 py-1 rounded-md font-medium flex items-center gap-1">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            LIVE
          </div>
        )}
      </div>

      {/* Uploader info */}
      {uploader && (
        <div className="mt-3 flex items-center gap-2 text-sm text-default-500">
          <User size={14} />
          <span className="truncate">{uploader}</span>
        </div>
      )}
    </div>
  );
};
