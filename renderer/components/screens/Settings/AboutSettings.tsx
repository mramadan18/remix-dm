import { useState, useEffect } from "react";
import { Card, CardBody, Button, Chip } from "@heroui/react";
import {
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Rocket,
} from "lucide-react";
import { formatBytes } from "../../../utils/formatters";
import { APP_CONFIG } from "../../../config/app-config";
import { useUpdate } from "../../../hooks/useUpdate";
import Image from "next/image";

export const AboutSettings = () => {
  const { status, progress, checkForUpdate, installUpdate } = useUpdate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const getStatusIcon = () => {
    switch (status.status) {
      case "checking":
        return <RefreshCw className="w-4 h-4 animate-spin text-brand-cyan" />;
      case "available":
        return <Download className="w-4 h-4 text-white" />;
      case "up-to-date":
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case "downloaded":
        return <RefreshCw className="w-4 h-4 text-white" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-danger" />;
      default:
        return null;
    }
  };

  return (
    <Card className="shadow-lg border-2 border-brand-cyan/20 bg-linear-to-r from-brand-cyan/5 via-transparent to-brand-purple/5">
      <CardBody className="p-6">
        <div className="flex flex-col md:flex-row items-center gap-8">
          {/* Brand/Logo Section */}
          <div className="flex flex-col items-center shrink-0">
            <div className="relative group">
              <div className="absolute -inset-1 bg-linear-to-r from-brand-cyan to-brand-purple rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-500"></div>
              <div className="relative w-20 h-20 bg-background/50 backdrop-blur-sm rounded-2xl border border-white/10 flex items-center justify-center overflow-hidden">
                <Image
                  src="/images/logo.png"
                  alt="Logo"
                  width={60}
                  height={60}
                  className="object-contain"
                />
              </div>
            </div>
          </div>

          {/* Info Section */}
          <div className="flex-1 flex flex-col gap-2 text-center md:text-left">
            <div className="flex flex-wrap items-center gap-2 justify-center md:justify-start">
              <h2 className="text-2xl font-black bg-linear-to-r from-brand-cyan to-brand-purple bg-clip-text text-transparent">
                {APP_CONFIG.name}
              </h2>
              <Chip
                size="sm"
                variant="flat"
                className="bg-primary/10 text-primary border-primary/20 font-bold"
              >
                v{mounted ? APP_CONFIG.version : "..."}
              </Chip>
              {status.status === "up-to-date" && (
                <Chip
                  size="sm"
                  color="success"
                  variant="flat"
                  startContent={<ShieldCheck size={14} />}
                >
                  Secure & Up to date
                </Chip>
              )}
            </div>
            <p className="text-default-500 text-sm max-w-xl">
              {APP_CONFIG.description}
            </p>

            <div className="flex flex-wrap gap-4 mt-2 justify-center md:justify-start">
              <Button
                size="sm"
                variant="light"
                className="text-default-500 hover:text-primary font-medium"
                onPress={() => window.open(APP_CONFIG.links.website, "_blank")}
              >
                Visit Website
              </Button>
              <div className="w-1 h-1 rounded-full bg-default-300 mt-3 hidden md:block" />
              <Button
                size="sm"
                variant="light"
                className="text-default-500 hover:text-primary font-medium"                onPress={() => window.ipc.invoke("shell:open-logs", null)}
              >
                Open Logs
              </Button>
              <div className="w-1 h-1 rounded-full bg-default-300 mt-3 hidden md:block" />
              <Button
                size="sm"
                variant="light"
                className="text-default-500 hover:text-primary font-medium"                onPress={() => window.open(APP_CONFIG.links.github, "_blank")}
              >
                Source Code
              </Button>
            </div>
          </div>

          {/* Update Action Section */}
          <div className="shrink-0 flex flex-col items-center md:items-end gap-3 min-w-50">
            {status.status === "downloaded" ? (
              <Button
                className="w-full font-bold bg-linear-to-r from-success to-emerald-600 text-white shadow-lg shadow-success/20 py-6"
                onPress={installUpdate}
                startContent={<RefreshCw className="w-5 h-5" />}
              >
                Restart & Update
              </Button>
            ) : status.status === "available" ? (
              <Button
                className="w-full font-bold bg-linear-to-r from-brand-cyan to-brand-purple text-white shadow-lg shadow-brand-cyan/20 py-6"
                onPress={checkForUpdate}
                startContent={<Rocket className="w-5 h-5 shadow-sm" />}
              >
                Get Update Now
              </Button>
            ) : (
              <Button
                variant="flat"
                className="w-full font-bold border-brand-cyan/20 px-8 py-6"
                color="secondary"
                onPress={checkForUpdate}
                isLoading={status.status === "checking"}
                startContent={
                  !status.status.includes("checking") && getStatusIcon()
                }
              >
                {status.status === "checking"
                  ? "Checking..."
                  : status.status === "error"
                    ? "Retry"
                    : "Check Updates"}
              </Button>
            )}

            {status.message && (
              <p
                className={`text-[11px] font-medium text-center md:text-right ${
                  status.status === "error" ? "text-danger" : "text-default-400"
                }`}
              >
                {status.message}
              </p>
            )}

            {progress && status.status === "available" && (
              <div className="w-full space-y-2 mt-1">
                <div className="h-1.5 w-full bg-default-100 rounded-full overflow-hidden border border-white/5">
                  <div
                    className="h-full bg-linear-to-r from-brand-cyan to-brand-purple transition-all duration-300"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] font-bold text-default-400">
                  <div className="flex flex-col md:flex-row md:items-center md:gap-2">
                    <div className="flex gap-1">
                      <span>Downloading...</span>
                      {progress.total > 0 && (
                        <span className="text-primary/70">
                          ({formatBytes(progress.transferred)} /{" "}
                          {formatBytes(progress.total)})
                        </span>
                      )}
                    </div>
                    {progress.bytesPerSecond > 0 && (
                      <span className="text-brand-purple/70">
                        • {formatBytes(progress.bytesPerSecond)}/s
                      </span>
                    )}
                  </div>
                  <span>{Math.round(progress.percent)}%</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
