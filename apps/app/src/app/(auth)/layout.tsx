import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ThemeToggle className="theme-fixed" />
      {children}
    </>
  );
}
