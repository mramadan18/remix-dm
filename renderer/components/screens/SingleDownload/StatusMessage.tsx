import { Card, CardBody } from "@heroui/react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

interface StatusMessageProps {
  message: string;
  type: "error" | "success";
}

export const StatusMessage = ({ message, type }: StatusMessageProps) => {
  const isError = type === "error";

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="mb-6"
    >
      <Card
        className={`${
          isError
            ? "border-danger/30 bg-danger/10"
            : "border-success/30 bg-success/10"
        }`}
      >
        <CardBody className="flex flex-row items-start gap-3 py-3">
          {isError ? (
            <AlertCircle className="text-danger shrink-0" size={20} />
          ) : (
            <CheckCircle2 className="text-success shrink-0" size={20} />
          )}
          <p
            className={`${
              isError ? "text-danger" : "text-success"
            } break-all whitespace-pre-wrap min-w-0`}
          >
            {message}
          </p>
        </CardBody>
      </Card>
    </motion.div>
  );
};
