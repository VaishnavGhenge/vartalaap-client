import Navbar from '../components/Navbar/Navbar'
import { IBM_Plex_Sans_Devanagari } from 'next/font/google'

const ibmPlexSansDevanagari = IBM_Plex_Sans_Devanagari({ weight: '500', subsets: ['cyrillic-ext'] });

export default function Home() {
  return (
    <div>
      <Navbar></Navbar>
      <main className='h-full'>
        <div className='container mx-auto'>
        <div className='grid grid-cols-2'>
          <div className='w-100 flex justify-center items-center'>
            <img className='w-full h-full' src="/static/images/hero.svg" alt="Hero image" />
          </div>
          <div className='w-100 flex flex-col justify-center items-start'>
            <div>
              <h2 className='text-3xl my-4 capitalize'>
                <span>Vartalaap - </span><span className={ibmPlexSansDevanagari.className}>वार्तालाप</span>
              </h2>
              <p className='font-light my-4'>A video chatting app which enable you to connect and organize meettings seamlessely</p>
            </div>
            <form method='post'>
              <div className='flex gap-2'>
                <input className='bg-slate-300 text-black rounded px-4 py-3 text-lg active:outline-sky-700 focus-visible:outline-sky-700' type="text" name='meet-code' placeholder='Enter meeting code or link' />
                <button className='bg-sky-700 px-4 py-3 rounded text-white' type='submit'>
                  <span>New meeting</span>
                </button>
              </div>
            </form>
          </div>
        </div>
        </div>
      </main>
    </div>
  )
}
