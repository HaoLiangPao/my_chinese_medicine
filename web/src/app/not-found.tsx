import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto mt-10 max-w-sm text-center">
      <p className="font-serif text-xl font-bold">找不到这个页面</p>
      <p className="mt-1 text-sm text-muted">可能已经被删除，或者你没有权限查看。</p>
      <Link href="/" className="btn-ghost mt-4">回到总览</Link>
    </div>
  );
}
