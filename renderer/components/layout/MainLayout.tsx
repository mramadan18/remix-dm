import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout = ({ children }: MainLayoutProps) => {
  return (
    <div>
      <Topbar />
      <div className="grid grid-cols-[100px_1fr] h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-background font-sans text-foreground">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <main className="grid place-items-center overflow-y-auto p-4 bg-default-50/50">
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
