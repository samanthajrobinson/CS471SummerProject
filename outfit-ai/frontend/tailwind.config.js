/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        blush: {
          50:'#fff6fa',100:'#ffe9f2',200:'#ffcfe1',300:'#ffb3ce',400:'#ff99be',
          500:'#f28ab3',600:'#e07ca6',700:'#c76893',800:'#a15377',900:'#7e405e'
        }
      },
      boxShadow: { soft:'0 10px 30px rgba(0,0,0,.06)' },
      borderRadius: { '2xl':'1.25rem' }
    }
  },
  plugins: []
}
