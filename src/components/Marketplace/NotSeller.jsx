export default function NotSeller() {
  return (
    <div className="p-6 text-center text-gray-600">
      {/* Guard screen: user is not a seller */}
      <p className="text-lg font-medium">
        You are not registered as a seller.
      </p>
      <p className="mt-2 text-sm">
        Switch to buyer features or become a seller to continue.
      </p>
    </div>
  );
}
