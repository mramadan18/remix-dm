import { useMultiDownload } from "../hooks/useMultiDownload";
import {
  MultiLinksHeader,
  MultiLinksInput,
  MultiLinksQueue,
} from "../components/screens/MultiLinks";

const MultiPage = () => {
  const {
    urls,
    setUrls,
    parsedItems,
    handleParse,
    clearAll,
    handleRemoveItem,
    startAllDownloads,
  } = useMultiDownload();

  return (
    <div className="w-full max-w-7xl mx-auto">
      <MultiLinksHeader onClear={clearAll} />

      <div className="grid grid-cols-1 gap-6">
        <MultiLinksInput urls={urls} setUrls={setUrls} onParse={handleParse} />
        <MultiLinksQueue
          items={parsedItems}
          onRemoveItem={handleRemoveItem}
          onStartAll={startAllDownloads}
        />
      </div>
    </div>
  );
};

export default MultiPage;
