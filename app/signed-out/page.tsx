import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Signed out · Kalos" };

export default function SignedOutPage() {
  return (
    <AuthCard title="You are signed out" description="Your Kalos session on this device has ended.">
      <Link href="/sign-in" className={buttonVariants({ size: "lg" })}>
        Sign in again
      </Link>
    </AuthCard>
  );
}
