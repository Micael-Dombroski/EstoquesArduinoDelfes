import { Nav } from "@/components/nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen md:pl-60">
      <Nav />
      <main className="mx-auto max-w-4xl p-4 pb-24 md:p-8">{children}</main>
    </div>
  );
}