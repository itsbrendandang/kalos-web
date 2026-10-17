import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/server/auth-actions";

/** Sign out is a POST (server action), never a GET link. */
export function SignOutButton({ variant = "outline" }: { variant?: "outline" | "ghost" | "secondary" }) {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant={variant} className="w-full">
        Sign out
      </Button>
    </form>
  );
}
