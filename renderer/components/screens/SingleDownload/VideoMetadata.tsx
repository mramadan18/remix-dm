import { Clock, Globe, Eye } from "lucide-react";
import { formatDuration, formatViewCount } from "../../../utils/formatters";
import { VideoInfo } from "../../../types/download";

export const VideoMetadata = ({
  title,
  duration,
  viewCount,
  extractor,
}: VideoInfo) => {
  return (
    <div>
      <h3 className="text-2xl font-bold mb-2 line-clamp-2">{title}</h3>
      <div className="flex flex-wrap gap-4 text-small text-default-500 mb-6">
        {duration && (
          <div className="flex items-center gap-1">
            <Clock size={16} />
            <span>{formatDuration(duration)}</span>
          </div>
        )}
        {viewCount && (
          <div className="flex items-center gap-1">
            <Eye size={16} />
            <span>{formatViewCount(viewCount)} views</span>
          </div>
        )}

        <div className="flex items-center gap-1 text-primary font-medium">
          <Globe size={16} />
          <span>{extractor || "Direct Link"}</span>
        </div>
      </div>
    </div>
  );
};
