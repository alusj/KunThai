
import { t as i18nText } from "./i18n/index";// src/Profile.jsx
export default function Profile() {
  return (
    <div className="max-w-2xl mx-auto">

      {/* Profile header */}
      <div className="flex flex-col items-center py-6">
        <div className="w-24 h-24 rounded-full bg-slate-300 mb-3" />
        <h2 className="text-lg font-bold">{i18nText("ui.literals.kf48db7e9d3ef")}</h2>
        <p className="text-sm text-gray-500">{i18nText("ui.literals.k36687c352204")}</p>
      </div>

      {/* Stats */}
      <div className="flex justify-around border-y py-4 text-center">
        <div>
          <p className="font-bold">0</p>
          <p className="text-sm text-gray-500">{i18nText("ui.literals.ka0ca0c319894")}</p>
        </div>
        <div>
          <p className="font-bold">0</p>
          <p className="text-sm text-gray-500">{i18nText("ui.literals.k8f3509b64e0e")}</p>
        </div>
        <div>
          <p className="font-bold">0</p>
          <p className="text-sm text-gray-500">{i18nText("ui.literals.k56b71e89fb10")}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 space-y-3">
        <button className="w-full py-2 rounded bg-blue-600 text-white">
          {i18nText("ui.literals.kcd280a41f758")}
        </button>

        <button className="w-full py-2 rounded bg-slate-200">
          {i18nText("ui.literals.kc7f73bb54d92")}
        </button>
      </div>

    </div>
  );
}
