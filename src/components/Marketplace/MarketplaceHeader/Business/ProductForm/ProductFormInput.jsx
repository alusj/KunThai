export default function ProductFormInput(props) {
  return (
    <input
      {...props}
      className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm font-medium outline-none transition focus:border-blue-500"
    />
  );
}
