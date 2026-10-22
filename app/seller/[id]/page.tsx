"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";

type Profile = {
  id: string;
  username: string | null;
  created_at: string;
};

type Listing = {
  id: string;
  title: string;
  description: string;
  price: number;
  city: string;
  image_url: string | null;
  created_at: string;
};

export default function SellerPage() {
  const params = useParams<{ id: string }>();
  const sellerId = params.id;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = getSupabase();
    let alive = true;

    async function load() {
      if (!supabase || !sellerId) {
        setError("Не удалось подключиться к базе данных.");
        setLoading(false);
        return;
      }

      const [profileResult, listingsResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,username,created_at")
          .eq("id", sellerId)
          .maybeSingle(),
        supabase
          .from("listings")
          .select("id,title,description,price,city,image_url,created_at")
          .eq("user_id", sellerId)
          .eq("status", "approved")
          .order("created_at", { ascending: false }),
      ]);

      if (!alive) return;

      if (profileResult.error || listingsResult.error) {
        setError("Не удалось загрузить профиль. Попробуй обновить страницу.");
      } else if (!profileResult.data) {
        setError("Профиль продавца не найден.");
      } else {
        setProfile(profileResult.data as Profile);
        setListings((listingsResult.data ?? []) as Listing[]);
      }

      setLoading(false);
    }

    void load();
    return () => {
      alive = false;
    };
  }, [sellerId]);

  return (
    <main className="shell" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <Link href="/" className="btn secondary">← На главную</Link>

      {loading ? (
        <p>Загрузка профиля…</p>
      ) : error ? (
        <div className="notice error">{error}</div>
      ) : profile ? (
        <>
          <section className="panel" style={{ marginTop: 20, marginBottom: 24 }}>
            <div style={{
              width: 68, height: 68, borderRadius: "50%",
              background: "#eeeefe", color: "#5b5ce2",
              display: "grid", placeItems: "center",
              fontSize: 28, fontWeight: 800, marginBottom: 14
            }}>
              {(profile.username?.trim() || "П").slice(0, 1).toUpperCase()}
            </div>
            <h1 style={{ margin: "0 0 8px" }}>
              {profile.username?.trim() || "Продавец"}
            </h1>
            <p>
              На сайте с {new Date(profile.created_at).toLocaleDateString("ru-RU")}
            </p>
            <p>Опубликованных объявлений: {listings.length}</p>
            <Link href="/#chat" className="btn primary">
              Перейти к чату
            </Link>
            <p className="muted">
              Чтобы написать продавцу, выбери его объявление в разделе чата на главной странице.
            </p>
          </section>

          <h2>Объявления продавца</h2>
          <div className="cards" style={{ marginTop: 14 }}>
            {listings.length === 0 ? (
              <div className="empty">
                <strong>Пока нет опубликованных объявлений</strong>
              </div>
            ) : listings.map((item) => (
              <article className="card" key={item.id}>
                <div className="photo">
                  {item.image_url
                    ? <img src={item.image_url} alt={item.title} />
                    : <span>◇</span>}
                </div>
                <div className="card-body">
                  <h3>{item.title}</h3>
                  <div className="price">
                    {new Intl.NumberFormat("ru-RU", {
                      maximumFractionDigits: 2
                    }).format(Number(item.price))} ₽
                  </div>
                  <div className="meta">
                    {item.city} · {new Date(item.created_at).toLocaleDateString("ru-RU")}
                  </div>
                  <p className="muted" style={{ overflowWrap: "anywhere" }}>
                    {item.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </main>
  );
}
