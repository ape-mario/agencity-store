/**
 * `/providers/[pda]` — the provider profile page, opened as a popup over the city.
 */
import { ProviderPopup } from "./ProviderPopup";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pda: string }> };

export default async function ProviderPage({ params }: Params) {
  const { pda } = await params;
  return <ProviderPopup pda={pda} />;
}
