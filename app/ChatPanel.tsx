"use client";

import { FormEvent, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Listing = {
  id: string;
  user_id: string;
  title: string;
};

type Conversation = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  created_at: string;
  last_message_at: string | null;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export default function ChatPanel({
  supabase,
  user,
  listings,
}: {
  supabase: SupabaseClient | null;
  user: { id: string } | null;
  listings: Listing[];
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [unreadByConversation, setUnreadByConversation] =
    useState<Record<string, number>>({});
  const [messageNotice, setMessageNotice] = useState<{
    conversationId: string;
    title: string;
    body: string;
  } | null>(null);

  async function loadConversations() {
    if (!supabase || !user) {
      setConversations([]);
      return;
    }

    const { data, error } = await supabase
      .from("conversations")
      .select("id,listing_id,buyer_id,seller_id,created_at,last_message_at")
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (error) {
      setNotice("Не удалось загрузить чаты: " + error.message);
      return;
    }

    setConversations((data ?? []) as Conversation[]);
  }

  useEffect(() => {
    setActive(null);
    setMessages([]);
    setUnreadByConversation({});
    setMessageNotice(null);
    void loadConversations();
  }, [supabase, user?.id]);

  const activeId = active?.id;

  useEffect(() => {
    if (!supabase || !user || conversations.length === 0) return;

    const channel = supabase
      .channel("message-notifications-" + user.id)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const incoming = payload.new as Message;

          if (incoming.sender_id === user.id) return;

          const conversation = conversations.find(
            (item) => item.id === incoming.conversation_id
          );

          if (!conversation || activeId === incoming.conversation_id) return;

          const title =
            listings.find((item) => item.id === conversation.listing_id)
              ?.title ?? "Объявление";

          setUnreadByConversation((previous) => ({
            ...previous,
            [conversation.id]: (previous[conversation.id] ?? 0) + 1,
          }));

          setMessageNotice({
            conversationId: conversation.id,
            title,
            body: incoming.body,
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, user?.id, conversations, activeId, listings]);

  useEffect(() => {
    if (!supabase || !activeId) {
      setMessages([]);
      return;
    }

    let alive = true;

    async function loadMessages() {
      const { data, error } = await supabase!
        .from("messages")
        .select("id,conversation_id,sender_id,body,created_at")
        .eq("conversation_id", activeId)
        .order("created_at", { ascending: true });

      if (!alive) return;

      if (error) {
        setNotice("Не удалось загрузить сообщения: " + error.message);
        return;
      }

      setMessages((data ?? []) as Message[]);
    }

    void loadMessages();

    const channel = supabase
      .channel("chat-" + activeId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeId}`,
        },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((previous) =>
            previous.some((m) => m.id === incoming.id)
              ? previous
              : [...previous, incoming].sort(
                  (a, b) =>
                    a.created_at.localeCompare(b.created_at)
                )
          );
        }
      )
      .subscribe();

    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase, activeId]);

  async function openChat(listing: Listing) {
    if (!supabase || !user) {
      setNotice("Войди в аккаунт, чтобы начать переписку.");
      return;
    }

    if (listing.user_id === user.id) {
      setNotice("Нельзя начать чат с самим собой.");
      return;
    }

    setBusy(true);
    setNotice("");

    const { data: existing, error: findError } = await supabase
      .from("conversations")
      .select("id,listing_id,buyer_id,seller_id,created_at,last_message_at")
      .eq("listing_id", listing.id)
      .eq("buyer_id", user.id)
      .eq("seller_id", listing.user_id)
      .maybeSingle();

    if (findError) {
      setBusy(false);
      setNotice("Не удалось открыть чат: " + findError.message);
      return;
    }

    let conversation = existing as Conversation | null;

    if (!conversation) {
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          listing_id: listing.id,
          buyer_id: user.id,
          seller_id: listing.user_id,
        })
        .select("id,listing_id,buyer_id,seller_id,created_at,last_message_at")
        .single();

      if (error) {
        setBusy(false);
        setNotice("Не удалось создать чат: " + error.message);
        return;
      }

      conversation = data as Conversation;
    }

    setActive(conversation);
    await loadConversations();
    setBusy(false);
  }

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const body = draft.trim();
    if (!supabase || !user || !active || !body || busy) return;

    setBusy(true);
    setNotice("");

    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: active.id,
        sender_id: user.id,
        body,
      })
      .select("id,conversation_id,sender_id,body,created_at")
      .single();

    setBusy(false);

    if (error) {
      setNotice("Не удалось отправить сообщение: " + error.message);
      return;
    }

    const sent = data as Message;
    setMessages((previous) =>
      previous.some((m) => m.id === sent.id)
        ? previous
        : [...previous, sent].sort(
            (a, b) => a.created_at.localeCompare(b.created_at)
          )
    );

    setDraft("");
    await loadConversations();
  }

  const activeListing = active
    ? listings.find((x) => x.id === active.listing_id)
    : null;

  return (
    <section
      className="panel"
      id="chat"
      style={{ marginTop: 24, scrollMarginTop: 20 }}
    >
      <h2>Чат покупателей и продавцов</h2>

      {messageNotice && (
        <div className="notice" role="status" style={{ marginBottom: 16 }}>
          <strong>Новое сообщение: {messageNotice.title}</strong>
          <p style={{ overflowWrap: "anywhere" }}>{messageNotice.body}</p>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              const target = conversations.find(
                (item) => item.id === messageNotice.conversationId
              );
              if (target) setActive(target);
              setUnreadByConversation((previous) => {
                const next = { ...previous };
                delete next[messageNotice.conversationId];
                return next;
              });
              setMessageNotice(null);
            }}
          >
            Открыть переписку
          </button>
        </div>
      )}

      {!user ? (
        <p className="muted">Войди в аккаунт, чтобы пользоваться чатом.</p>
      ) : (
        <>
          <h3>Начать переписку</h3>
          <p className="muted">
            Выбери объявление, чтобы написать его владельцу.
          </p>

          {listings.filter((x) => x.user_id !== user.id).length === 0 ? (
            <p className="muted">Пока нет чужих объявлений для переписки.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {listings
                .filter((x) => x.user_id !== user.id)
                .map((listing) => (
                  <button
                    key={listing.id}
                    type="button"
                    className="btn secondary"
                    disabled={busy}
                    onClick={() => void openChat(listing)}
                  >
                    Написать: {listing.title}
                  </button>
                ))}
            </div>
          )}

          <h3 style={{ marginTop: 24 }}>Мои переписки</h3>

          {conversations.length === 0 ? (
            <p className="muted">Переписок пока нет.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {conversations.map((conversation) => {
                const title =
                  listings.find((x) => x.id === conversation.listing_id)
                    ?.title ?? "Объявление";

                return (
                  <button
                    key={conversation.id}
                    type="button"
                    className={
                      "pill " +
                      (active?.id === conversation.id ? "active" : "")
                    }
                    onClick={() => {
                      setActive(conversation);
                      setUnreadByConversation((previous) => {
                        const next = { ...previous };
                        delete next[conversation.id];
                        return next;
                      });
                      if (messageNotice?.conversationId === conversation.id) {
                        setMessageNotice(null);
                      }
                    }}
                  >
                    {title}
                    {(unreadByConversation[conversation.id] ?? 0) > 0 &&
                      ` · Новых: ${unreadByConversation[conversation.id]}`}
                  </button>
                );
              })}
            </div>
          )}

          {active && (
            <div style={{ marginTop: 20 }}>
              <h3>{activeListing?.title ?? "Переписка"}</h3>

              <div
                style={{
                  maxHeight: 350,
                  overflowY: "auto",
                  padding: 12,
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  margin: "12px 0",
                }}
              >
                {messages.length === 0 ? (
                  <p className="muted">Напиши первое сообщение.</p>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      style={{
                        display: "flex",
                        justifyContent:
                          message.sender_id === user.id
                            ? "flex-end"
                            : "flex-start",
                        marginBottom: 10,
                      }}
                    >
                      <div
                        style={{
                          maxWidth: "85%",
                          padding: "9px 12px",
                          borderRadius: 12,
                          background:
                            message.sender_id === user.id
                              ? "#e4f3e8"
                              : "#f0f0f0",
                          overflowWrap: "anywhere",
                        }}
                      >
                        <div>{message.body}</div>
                        <small className="muted">
                          {new Date(message.created_at).toLocaleString("ru-RU")}
                        </small>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={sendMessage}>
                <div className="field">
                  <label htmlFor="chat-message">Сообщение</label>
                  <textarea
                    id="chat-message"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={4000}
                    required
                    placeholder="Напиши сообщение…"
                  />
                </div>
                <button
                  className="btn primary"
                  disabled={busy || !draft.trim()}
                >
                  {busy ? "Подожди…" : "Отправить"}
                </button>
              </form>
            </div>
          )}
        </>
      )}

      {notice && (
        <p className="notice error" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
