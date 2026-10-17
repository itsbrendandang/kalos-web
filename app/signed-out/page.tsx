import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Signed out · Kalos" };

export default function SignedOutPage() {
  return (
    <AuthCard title="You are signed out" description="Your Kalos session has ended on this device.">
      <Link href="/sign-in" className={buttonVariants({ variant: "outline" })}>
        Sign in again
      </Link>
    </AuthCard>
  );
}
