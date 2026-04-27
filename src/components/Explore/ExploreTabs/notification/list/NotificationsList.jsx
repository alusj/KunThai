import NotificationItem from "../components/NotificationItem";

export default function NotificationsList({ data, onOpen }) {
  return (
    <div className="w-full space-y-3">
      {data.map((item) => (
        <NotificationItem key={item.id} item={item} onOpen={onOpen} />
      ))}
    </div>
  );
}
