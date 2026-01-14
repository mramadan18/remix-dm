import { useState } from "react";
import { Card, CardBody, Tabs, Tab, Spinner, Chip } from "@heroui/react";
import { AlertCircle, CheckCircle2, Layers, LayoutGrid } from "lucide-react";
import {
  DownloadCard,
  DownloadsHeader,
  DownloadsStats,
  EmptyState,
} from "../components/screens/Downloads";
import { DownloadStatus, useDownloads } from "../hooks/useDownload";

const DownloadsPage = () => {
  const [selectedTab, setSelectedTab] = useState("active");
  const {
    downloads,
    activeDownloads,
    completedDownloads,
    failedDownloads,
    isLoading,
    error,
    pause,
    resume,
    cancel,
    clearCompleted,
    openLocation,
    executeFile,
  } = useDownloads();

  const getDisplayedDownloads = () => {
    switch (selectedTab) {
      case "all":
        return downloads;
      case "active":
        return downloads.filter(
          (d) =>
            d.status === DownloadStatus.DOWNLOADING ||
            d.status === DownloadStatus.PENDING ||
            d.status === DownloadStatus.PAUSED ||
            d.status === DownloadStatus.MERGING ||
            d.status === DownloadStatus.EXTRACTING ||
            d.status === DownloadStatus.CONVERTING
        );
      case "completed":
        return completedDownloads;
      case "failed":
        return failedDownloads;
      default:
        return downloads;
    }
  };

  const displayedDownloads = getDisplayedDownloads();

  const handlePauseAll = async () => {
    for (const download of activeDownloads) {
      if (download.status === DownloadStatus.DOWNLOADING) {
        await pause(download.id);
      }
    }
  };

  const handleResumeAll = async () => {
    for (const download of downloads) {
      if (download.status === DownloadStatus.PAUSED) {
        await resume(download.id);
      }
    }
  };

  const totalDownloaded = downloads.reduce(
    (acc, d) => acc + (d.progress.downloadedBytes || 0),
    0
  );

  if (isLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto flex items-center justify-center py-20">
        <Spinner size="lg" color="primary" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <DownloadsHeader
        total={downloads.length}
        active={activeDownloads.length}
        completed={completedDownloads.length}
        onPauseAll={handlePauseAll}
        onResumeAll={handleResumeAll}
        onClearCompleted={clearCompleted}
        isPauseDisabled={activeDownloads.length === 0}
        isResumeDisabled={
          !downloads.some((d) => d.status === DownloadStatus.PAUSED)
        }
        isClearDisabled={
          !downloads.some(
            (d) =>
              d.status === DownloadStatus.COMPLETED ||
              d.status === DownloadStatus.FAILED ||
              d.status === DownloadStatus.CANCELLED
          )
        }
      />

      {error && (
        <Card className="mb-4 border-danger/30 bg-danger/10">
          <CardBody className="flex flex-row items-center gap-3 py-3">
            <AlertCircle className="text-danger" size={20} />
            <span className="text-danger">{error}</span>
          </CardBody>
        </Card>
      )}

      <Tabs
        selectedKey={selectedTab}
        onSelectionChange={(key) => setSelectedTab(key as string)}
        className="mb-6"
        color="primary"
        variant="underlined"
      >
        <Tab
          key="all"
          title={
            <div className="flex items-center gap-2">
              <LayoutGrid size={16} />
              <span>All</span>
              {downloads.length > 0 && (
                <Chip size="sm" color="default" variant="flat">
                  {downloads.length}
                </Chip>
              )}
            </div>
          }
        />
        <Tab
          key="active"
          title={
            <div className="flex items-center gap-2">
              <Layers size={16} />
              <span>Active</span>
              {activeDownloads.length > 0 && (
                <Chip size="sm" color="primary" variant="flat">
                  {activeDownloads.length}
                </Chip>
              )}
            </div>
          }
        />
        <Tab
          key="completed"
          title={
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>Completed</span>
              {completedDownloads.length > 0 && (
                <Chip size="sm" color="success" variant="flat">
                  {completedDownloads.length}
                </Chip>
              )}
            </div>
          }
        />
        <Tab
          key="failed"
          title={
            <div className="flex items-center gap-2">
              <AlertCircle size={16} />
              <span>Failed</span>
              {failedDownloads.length > 0 && (
                <Chip size="sm" color="danger" variant="flat">
                  {failedDownloads.length}
                </Chip>
              )}
            </div>
          }
        />
      </Tabs>

      <div className="flex flex-col gap-3">
        {displayedDownloads.length === 0 ? (
          <EmptyState
            type={selectedTab as "active" | "completed" | "failed" | "all"}
          />
        ) : (
          displayedDownloads.map((item) => (
            <DownloadCard
              key={item.id}
              item={item}
              onPause={pause}
              onResume={resume}
              onCancel={cancel}
              onOpenLocation={openLocation}
              onOpenFile={executeFile}
            />
          ))
        )}
      </div>

      {downloads.length > 0 && (
        <DownloadsStats
          totalDownloaded={totalDownloaded}
          completedCount={completedDownloads.length}
        />
      )}
    </div>
  );
};

export default DownloadsPage;
