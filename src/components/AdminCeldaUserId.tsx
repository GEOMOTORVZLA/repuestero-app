type Props = {
  userId: string;
  onVer: () => void;
};

export function AdminCeldaUserId({ userId, onVer }: Props) {
  if (!userId.trim()) {
    return <span className="dashboard-admin-userid-vacio">-</span>;
  }

  return (
    <button
      type="button"
      className="dashboard-admin-userid-btn"
      onClick={onVer}
      title="Ver User ID completo"
      aria-label="Ver User ID completo"
    >
      ID
    </button>
  );
}
