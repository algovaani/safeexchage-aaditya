export default function PageLoader() {
  return (
    <div className="flex items-center justify-center py-16 min-h-[40vh]" aria-busy="true">
      <div className="h-8 w-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
    </div>
  );
}
