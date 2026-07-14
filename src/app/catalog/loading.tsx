"use client";

/**
 * Instant loading state for `/catalog` navigations. The page awaits a
 * server-side indexer read before it can render, so without this the user
 * stares at the game for seconds after clicking — this renders the modal
 * frame + skeleton immediately while the RSC payload streams in.
 */
import { useRouter } from "next/navigation";
import { CityModal } from "@/app/city/components/CityModal";
import { setPopupClosing } from "@/app/city/lib/popup-state";
import { CatalogSkeleton } from "./CatalogSkeleton";

export default function CatalogLoading() {
  const router = useRouter();

  const handleClose = () => {
    setPopupClosing(true);
    router.push("/");
  };

  return (
    <CityModal
      title="Catalog"
      icon="📋"
      subtitle="Browse and hire vetted AI agents"
      onClose={handleClose}
      maxWidth="7xl"
      fullHeight
    >
      <CatalogSkeleton />
    </CityModal>
  );
}
