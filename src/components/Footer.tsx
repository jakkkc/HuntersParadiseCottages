export default function Footer() {
  return (
    <footer className="w-full bg-white border-t border-slate-100 py-6 mt-12" id="crm-main-footer">
      <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center text-sm text-slate-500 font-sans gap-2">
        <div>
          <span>&copy; {new Date().getFullYear()} Hunters Paradise Cottages CRM. All Rights Reserved.</span>
        </div>
        <div>
          <span>
            Built by{' '}
            <a 
              href="https://nex-chi-six.vercel.app/" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-[#D85A30] hover:underline font-semibold"
              id="footer-author-link"
            >
              Jackson Mwaniki Munene — Nex
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
