"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";

type Listing = {
  id: string; user_id: string; title: string; description: string; price: number;
  city: string; image_url: string | null; status: "pending"|"approved"|"rejected"|"needs_review"; created_at: string;
};

export default function Home() {
  const supabase = useMemo(() => getSupabase(), []);
  const [listings,setListings] = useState<Listing[]>([]);
  const [mine,setMine] = useState<Listing[]>([]);
  const [user,setUser] = useState<{id:string;email?:string}|null>(null);
  const [email,setEmail] = useState(""); const [password,setPassword] = useState("");
  const [title,setTitle] = useState(""); const [description,setDescription] = useState("");
  const [price,setPrice] = useState(""); const [city,setCity] = useState(""); const [imageUrl,setImageUrl] = useState("");
  const [search,setSearch] = useState(""); const [filter,setFilter] = useState<"all"|"mine">("all");
  const [notice,setNotice] = useState(""); const [kind,setKind] = useState("info"); const [busy,setBusy] = useState(false);
  const say=(s:string,k="info")=>{setNotice(s);setKind(k)};
  async function loadListings(uid?:string) {
    if(!supabase) return;
    const {data,error}=await supabase.from("listings").select("id,user_id,title,description,price,city,image_url,status,created_at").order("created_at",{ascending:false}).limit(100);
    if(error){say("Не удалось загрузить объявления. Проверь настройки Supabase.","error");return;}
    const all=(data??[]) as Listing[];
    setListings(all.filter(x=>x.status==="approved")); setMine(uid?all.filter(x=>x.user_id===uid):[]);
  }
  useEffect(()=>{
    if(!supabase)return; let alive=true;
    supabase.auth.getSession().then(({data})=>{if(!alive)return;const u=data.session?.user;setUser(u?{id:u.id,email:u.email}:null);void loadListings(u?.id);});
    const {data:listener}=supabase.auth.onAuthStateChange((_e,session)=>{const u=session?.user;setUser(u?{id:u.id,email:u.email}:null);void loadListings(u?.id);});
    return()=>{alive=false;listener.subscription.unsubscribe();};
  },[supabase]);
  const source=filter==="mine"?mine:listings;
  const term=search.trim().toLocaleLowerCase("ru");
  const shown=source.filter(x=>!term||[x.title,x.description,x.city].some(v=>v.toLocaleLowerCase("ru").includes(term)));
  async function signIn(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!supabase)return;setBusy(true);const {error}=await supabase.auth.signInWithPassword({email,password});setBusy(false);if(error)say("Не удалось войти: "+error.message,"error");else say("Вход выполнен.","success");}
  async function signUp(){if(!supabase)return;if(!email.trim()||password.length<8){say("Укажи почту и пароль не короче 8 символов.","error");return;}setBusy(true);const {data,error}=await supabase.auth.signUp({email,password});setBusy(false);if(error)say("Ошибка регистрации: "+error.message,"error");else if(!data.session)say("Проверь почту и подтверди регистрацию, затем войди.","success");else say("Аккаунт создан.","success");}
  async function signOut(){if(!supabase)return;await supabase.auth.signOut();setUser(null);setMine([]);say("Выход выполнен.","success");}
  async function createListing(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!supabase||!user){say("Сначала войди в аккаунт.","error");return;}
    const amount=Number(price);if(!Number.isFinite(amount)||amount<0){say("Укажи корректную цену.","error");return;}
    setBusy(true);const {error}=await supabase.from("listings").insert({user_id:user.id,title:title.trim(),description:description.trim(),price:amount,city:city.trim(),image_url:imageUrl.trim()||null,status:"pending"});setBusy(false);
    if(error){say("Не удалось отправить объявление: "+error.message,"error");return;}
    setTitle("");setDescription("");setPrice("");setCity("");setImageUrl("");setFilter("mine");say("Объявление отправлено на ручную проверку. После одобрения оно появится в каталоге.","success");await loadListings(user.id);
  }
  return <>
    <header className="topbar"><div className="shell nav"><a className="logo" href="#">рядом.</a><input className="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Найти объявление" aria-label="Поиск объявлений"/>{user?<button className="btn secondary" onClick={signOut}>Выйти</button>:<a className="btn primary" href="#account">Войти</a>}</div></header>
    <main className="shell">
      <section className="hero"><div className="hero-panel"><h1>Вещи находят новых хозяев.</h1><p>Покупай, продавай и находи полезное рядом. Публикация объявлений бесплатна.</p></div></section>
      {!supabase&&<div className="notice error">Подключение к базе не настроено. Добавь переменные из .env.example в настройках хостинга.</div>}
      {notice&&<div className={"notice "+(kind==="error"?"error":kind==="success"?"success":"")} role="status">{notice}</div>}
      <div className="section-head"><div><h2>{filter==="mine"?"Мои объявления":"Свежие объявления"}</h2><span className="muted">{filter==="mine"?"Статусы проверки":"Проверенные объявления пользователей"}</span></div><div className="pills"><button className={"pill "+(filter==="all"?"active":"")} onClick={()=>setFilter("all")}>Все</button><button className={"pill "+(filter==="mine"?"active":"")} onClick={()=>user?setFilter("mine"):say("Войди, чтобы увидеть свои объявления.","error")}>Мои</button></div></div>
      <div className="layout"><section><div className="cards">{shown.length===0?<div className="empty"><div style={{fontSize:32}}>⌕</div><strong>{filter==="mine"?"Пока нет твоих объявлений":"Пока нет объявлений"}</strong><p className="muted">{search?"Попробуй изменить запрос.":"Проверенные объявления появятся здесь."}</p></div>:shown.map(x=><article className="card" key={x.id}><div className="photo">{x.image_url?<img src={x.image_url} alt={x.title}/>:<span>◇</span>}</div><div className="card-body">{filter==="mine"&&<span className="status">{x.status==="approved"?"Опубликовано":x.status==="rejected"?"Отклонено":x.status==="needs_review"?"Нужна проверка":"На модерации"}</span>}<h3>{x.title}</h3><div className="price">{new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(Number(x.price))} ₽</div><div className="meta">⌖ {x.city} · {new Date(x.created_at).toLocaleDateString("ru-RU")}</div><p className="muted" style={{overflowWrap:"anywhere"}}>{x.description}</p></div></article>)}</div></section>
      <aside className="panel" id="account">{!user?<><h2>Твой аккаунт</h2><p>Войди или зарегистрируйся, чтобы разместить бесплатное объявление.</p><form onSubmit={signIn}><div className="field"><label htmlFor="email">Электронная почта</label><input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></div><div className="field"><label htmlFor="password">Пароль</label><input id="password" type="password" minLength={8} autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Не менее 8 символов"/></div><button className="btn primary full" disabled={busy||!supabase}>{busy?"Подожди…":"Войти"}</button></form><button className="btn secondary full" style={{marginTop:9}} disabled={busy||!supabase} onClick={signUp}>Создать аккаунт</button><p>Может потребоваться подтверждение почты.</p></>:<><h2>Новое объявление</h2><p>Публикация бесплатна. Новые объявления проходят проверку.</p><form onSubmit={createListing}><div className="field"><label htmlFor="title">Название</label><input id="title" value={title} onChange={e=>setTitle(e.target.value)} minLength={3} maxLength={120} required placeholder="Например, велосипед"/></div><div className="field"><label htmlFor="description">Описание</label><textarea id="description" value={description} onChange={e=>setDescription(e.target.value)} minLength={5} maxLength={5000} required placeholder="Состояние, характеристики, детали…"/></div><div className="field"><label htmlFor="price">Цена, ₽</label><input id="price" type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} required placeholder="0"/></div><div className="field"><label htmlFor="city">Город</label><input id="city" value={city} onChange={e=>setCity(e.target.value)} minLength={2} maxLength={100} required placeholder="Твой город"/></div><div className="field"><label htmlFor="image">Ссылка на фото (необязательно)</label><input id="image" type="url" value={imageUrl} onChange={e=>setImageUrl(e.target.value)} placeholder="https://…"/></div><button className="btn primary full" disabled={busy}>{busy?"Отправка…":"Отправить на проверку"}</button></form></>}</aside></div>
    </main><footer className="footer"><div className="shell">© {new Date().getFullYear()} Рядом · Бесплатные объявления. Не сообщай незнакомцам пароли и коды.</div></footer>
  </>;
}
