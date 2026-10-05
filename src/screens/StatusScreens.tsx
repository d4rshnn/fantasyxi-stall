import { PlaceholderScreen } from "../components/PlaceholderScreen";

export function LoadingScreen() {
  return <PlaceholderScreen eyebrow="FantasyXI" title="Loading…" />;
}

export function LoadErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <PlaceholderScreen
      eyebrow="Something went wrong"
      title="Couldn't load the game data"
      body={`${message} Check that the site is being served (npm run dev or npm run preview), then try again.`}
      nextLabel="Try again"
      onNext={onRetry}
    />
  );
}
