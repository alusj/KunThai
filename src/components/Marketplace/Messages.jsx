// =======================
// Messages.jsx
// Buyer ↔ Seller negotiation UI
// Mobile-first & responsive
// =======================

import { useState } from "react";

export default function Messages() {
  // =======================
  // Mock conversations (temporary)
  // Later: Supabase real data
  // =======================
  const conversations = [
    {
      id: 1,
      name: "John Doe",
      product: "Wireless Headphones",
      messages: [
        { from: "buyer", text: "Is the price negotiable?" },
        { from: "seller", text: "Yes, what is your offer?" },
      ],
    },
  ];

  // =======================
  // Active chat state
  // =======================
  const [activeChat, setActiveChat] = useState(conversations[0]);

  return (
    <div className="h-full">
      {/* =======================
          Responsive layout
          Mobile: 1 column
          Desktop: 3 columns
          ======================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">

        {/* =======================
            LEFT: Conversation list
            ======================= */}
        <div className="md:col-span-1 border rounded-lg bg-white p-3">
          <h3 className="font-semibold text-gray-800 mb-3">Messages</h3>

          {conversations.map(chat => (
            <button
              key={chat.id}
              onClick={() => setActiveChat(chat)}
              className="w-full text-left p-2 rounded hover:bg-slate-100"
            >
              <p className="font-medium text-gray-800">{chat.name}</p>
              <p className="text-sm text-gray-500 truncate">
                {chat.product}
              </p>
            </button>
          ))}
        </div>

        {/* =======================
            RIGHT: Chat window
            ======================= */}
        <div className="md:col-span-2 border rounded-lg bg-white flex flex-col">

          {/* Chat header */}
          <div className="border-b p-3">
            <h4 className="font-semibold text-gray-800">
              {activeChat.product}
            </h4>
            <p className="text-sm text-gray-500">
              Chat with {activeChat.name}
            </p>
          </div>

          {/* Messages area */}
          <div className="flex-1 p-3 space-y-3 overflow-y-auto">
            {activeChat.messages.map((msg, index) => (
              <div
                key={index}
                className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm
                  ${msg.from === "buyer"
                    ? "bg-slate-200 text-gray-800"
                    : "bg-emerald-600 text-white ml-auto"
                  }`}
              >
                {msg.text}
              </div>
            ))}
          </div>

          {/* Message input */}
          <div className="sticky bottom-0 border-t bg-white p-3 flex gap-2">
            <input
              type="text"
              placeholder="Type your message..."
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
            <button className="bg-emerald-600 text-white px-4 rounded-lg text-sm">
              Send
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
