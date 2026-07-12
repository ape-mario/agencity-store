"use client";

import { Suspense, lazy } from "react";
import { useRouter } from "next/navigation";
import { CityModal } from "@/app/city/components/CityModal";
import { CatalogSkeleton } from "./CatalogSkeleton";
import { storeConfig } from "@/lib/config";
import { setPopupClosing } from "@/app/city/lib/popup-state";

const Catalog = lazy(() => import("@/app/catalog").then((m) => ({ default: m.Catalog })));

export function CatalogPopup() {
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
      <Suspense fallback={<CatalogSkeleton />}>
        <Catalog network={storeConfig.network} curation={storeConfig.curation} />
      </Suspense>
    </CityModal>
  );
}
