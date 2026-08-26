import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, onSnapshot, doc, getDoc, getDocs, deleteDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCvK8uUxUhvmV760B6cul981BD8CADqPpE",
  authDomain: "projeto-planner-966ca.firebaseapp.com",
  projectId: "projeto-planner-966ca",
  storageBucket: "projeto-planner-966ca.firebasestorage.app",
  messagingSenderId: "116304178516",
  appId: "1:116304178516:web:1f3a6fe922f03b98ea2cc1"
};

const fb = initializeApp(firebaseConfig);
const db = getFirestore(fb);
const auth = getAuth(fb);

// 👇 COLE SUA URL DO GOOGLE APPS SCRIPT AQUI DENTRO DAS ASPAS 👇
const GOOGLE_SHEETS_API_URL = "SUA_URL_DO_APP_SCRIPT_VEM_AQUI";


const app = {
    allTasks: [], 
    userMap: {},
    allLogs: [],
    allLockers: [],
    allReminders: [], 
    allPecas: [], 
    
    logFilter: 'Todos',
    logDateFilter: '',
    logOperatorFilter: 'Todos',
    
    lockerFilter: '1-andar',
    currentLockerId: null,
    editingLockerId: null,
    editingNotebookIndex: -1,
    movingNotebookIndex: -1,

    taskFilterStatus: [],
    taskFilterPriority: [],
    taskFilterAssignee: [],
    taskFilterDate: '',

    currentTaskId: null,
    commentsUnsub: null,
    currentSubtaskId: null,
    subtasksUnsub: null,
    subcommentsUnsub: null,
    allSubtasks: [],
    
    calcCurrent: '0',
    calcPrevious: '',
    calcOperation: null,

    reminderFilterStatus: 'Em aberto',
    reminderFilterDate: '',
    reminderFilterOperator: 'Todos',
    activeAlertId: null,

    globalTasksUnsub: null,
    globalNotifsUnsub: null,
    globalUsersUnsub: null,
    lockersUnsub: null,
    remindersUnsub: null, 
    alertCheckInterval: null, 
    estoquePollInterval: null, 
    
    audioCtx: null,
    beepInterval: null,
    blinkInterval: null,

    currentChatId: null,
    chatUnsub: null,

    init() { 
        this.bindEvents(); 
        this.checkAuth(); 
        this.initTheme(); 
        this.startClock();
        this.getWeather();
        this.requestNotificationPermission(); 
    },

    requestNotificationPermission() {
        if ("Notification" in window) {
            if (Notification.permission !== "granted" && Notification.permission !== "denied") {
                Notification.requestPermission();
            }
        }
    },

    startClock() {
        setInterval(() => {
            const el = document.getElementById('header-clock');
            if(el) {
                const now = new Date();
                el.innerText = now.toLocaleString('pt-BR');
            }
        }, 1000);
    },

    getWeather() {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                try {
                    const lat = pos.coords.latitude;
                    const lon = pos.coords.longitude;
                    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
                    const data = await res.json();
                    const temp = data.current_weather.temperature;
                    const el = document.getElementById('weather-temp');
                    if(el) {
                        el.innerText = `${temp}°C`;
                        el.previousElementSibling.innerText = 'thermostat';
                    }
                } catch(e) { console.log("Erro ao buscar clima", e); }
            });
        }
    },
    
    initTheme() { 
        const html = document.documentElement;
        if (localStorage.getItem('theme') === 'light') {
            html.classList.remove('dark');
        } else {
            html.classList.add('dark'); 
        }
    },

    toggleDarkMode() {
        const html = document.documentElement;
        if(html.classList.contains('dark')) {
            html.classList.remove('dark');
            localStorage.setItem('theme', 'light');
            app.showToast("Modo Claro ativado", "info");
        } else {
            html.classList.add('dark');
            localStorage.setItem('theme', 'dark');
            app.showToast("Modo Escuro ativado", "info");
        }
    },

    getTodayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    getUserData(val) {
        if (!val) return { nome: 'Desconhecido', foto: null, uid: '' };
        let u = app.userMap[val];
        if (!u) u = Object.values(app.userMap).find(x => x.nome === val);
        return u || { nome: val, foto: null, uid: val };
    },

    navigate(pageId) {
        document.querySelectorAll('.page-section').forEach(s => {
            s.classList.remove('active');
            s.classList.add('hidden');
        });
        
        const target = document.getElementById(`page-${pageId}`);
        if(target) {
            target.classList.add('active');
            target.classList.remove('hidden');
        }
        
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.className = "nav-btn text-left w-full flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface-variant font-medium hover:bg-surface-container-high hover:text-primary transition-colors";
        });
        const activeBtn = document.getElementById(`nav-btn-${pageId}`);
        if(activeBtn) {
            activeBtn.className = "nav-btn text-left w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-container-high text-primary font-bold scale-95 transition-all";
        }
        
        if(pageId === 'dashboard') { this.renderDashboard(); }
        if(pageId === 'armarios') { this.renderLockers(); }
        if(pageId === 'logbook') { this.renderLogbook(); }
        if(pageId === 'tarefas') { this.renderTasksPage(); }
        if(pageId === 'calculadora') { this.updateCalcDisplay(); }
        if(pageId === 'lembretes') { this.renderRemindersPage(); }
        if(pageId === 'configuracoes') { this.renderConfigPage(); }
        if(pageId === 'estoque') { this.renderEstoquePage(); }
        
        window.scrollTo(0,0);
    },

    async handleLogin(e) {
        if(e) e.preventDefault();
        try {
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-password').value;
            await signInWithEmailAndPassword(auth, email, pass);
        } catch(err) {
            app.showToast("Email ou senha incorretos", "error");
        }
    },

    bindEvents() {
        const lf = document.getElementById('login-form');
        if(lf) lf.addEventListener('submit', (e) => app.handleLogin(e));

        document.addEventListener('click', (e) => {
            if(!e.target.closest('.filter-dropdown-container')) {
                document.querySelectorAll('.filter-dropdown-menu').forEach(m => m.classList.add('hidden'));
            }
            if(!app.audioCtx && window.AudioContext) {
                app.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
        });

        document.addEventListener('keydown', (e) => {
            const calcPage = document.getElementById('page-calculadora');
            if(calcPage && calcPage.classList.contains('active')) {
                const key = e.key;
                if (/[0-9]/.test(key)) { app.calcAppend(key); }
                else if (key === '.' || key === ',') { app.calcAppend('.'); }
                else if (key === '+' || key === '-' || key === '*' || key === '/') { app.calcAppend(key); }
                else if (key === '%') { app.calcAppend('%'); }
                else if (key === 'Enter' || key === '=') { e.preventDefault(); app.calcCompute(); }
                else if (key === 'Backspace') { app.calcDelete(); }
                else if (key === 'Escape' || key === 'Delete') { app.calcClear(); }
            }
        });
    },

    checkAuth() { 
        onAuthStateChanged(auth, async (u) => { 
            const pLogin = document.getElementById('page-login'); 
            const appL = document.getElementById('app-layout'); 
            if(u){ 
                if(pLogin) pLogin.classList.add('hidden'); 
                if(appL) appL.classList.remove('hidden'); 
                
                try {
                    const ud = await getDoc(doc(db, "usuarios", u.uid));
                    let userName = u.displayName || u.email;
                    let userFoto = u.photoURL;
                    let userCargo = 'Membro da Equipe';

                    if(ud.exists()) {
                        const data = ud.data();
                        if(data.nome) userName = data.nome;
                        if(data.foto) userFoto = data.foto; 
                        if(data.cargo) userCargo = data.cargo;
                    }
                    
                    const sn = document.getElementById('sidebar-name');
                    if(sn) sn.innerText = userName;
                    app.updateAvatar(u, userFoto, userName, userCargo);
                } catch(e) { console.error(e); }
                
                app.listenToTasks(); 
                app.loadUsers(); 
                app.listenToNotifications();
                app.listenToLockers();
                app.listenToReminders(); 
                app.listenToEstoque(); // Inicia a conexão com Google Sheets
                
                app.navigate('dashboard'); 
            } else { 
                if(pLogin) pLogin.classList.remove('hidden'); 
                if(appL) appL.classList.add('hidden'); 
            } 
        }); 
    },

    updateAvatar(u, fotoDb, name, cargoDb) { 
        const av = document.getElementById('sidebar-avatar'); 
        if(!av) return;
        const fotoReal = fotoDb || u.photoURL;
        const nomeReal = name || u.displayName || u.email;
        if(fotoReal) { 
            av.innerText = ''; 
            av.style.backgroundImage = `url('${fotoReal}')`; 
        } else { 
            av.innerText = nomeReal.substring(0,2).toUpperCase(); 
            av.style.backgroundImage = 'none';
        } 
        
        const cg = document.getElementById('sidebar-cargo');
        if(cg) cg.innerText = cargoDb || 'Membro da Equipe';
    },

    /* =======================================
       SISTEMA DE ESTOQUE (PEÇAS) - VIA GOOGLE SHEETS
    ======================================= */
    listenToEstoque() {
        if(app.estoquePollInterval) clearInterval(app.estoquePollInterval);
        
        app.fetchEstoqueSheet(); // Carrega na hora

        // Atualiza a cada 15 segundos para não estourar a cota da API do Google
        app.estoquePollInterval = setInterval(() => {
            app.fetchEstoqueSheet();
        }, 15000); 
    },

    async fetchEstoqueSheet() {
        if(!GOOGLE_SHEETS_API_URL || GOOGLE_SHEETS_API_URL === "SUA_URL_DO_APP_SCRIPT_VEM_AQUI") return;
        
        try {
            const res = await fetch(GOOGLE_SHEETS_API_URL);
            const data = await res.json();
            app.allPecas = data;
            
            app.updateDashboardStats();
            if(document.getElementById('page-estoque').classList.contains('active')) {
                app.renderEstoquePage();
            }
        } catch(e) { console.error("Erro ao ler Planilha", e); }
    },

    renderEstoquePage() {
        const tbody = document.getElementById('estoque-tbody');
        if(!tbody) return;
        
        const searchVal = document.getElementById('estoque-search-inp').value.toLowerCase();
        let filtered = app.allPecas;

        if (searchVal) {
            filtered = filtered.filter(p => 
                p.peca.toLowerCase().includes(searchVal) || 
                p.modelo.toLowerCase().includes(searchVal) || 
                (p.observacao && p.observacao.toLowerCase().includes(searchVal))
            );
        }

        let html = '';
        filtered.forEach(p => {
            const novas = parseInt(p.qtdNovas) || 0;
            const reuso = parseInt(p.qtdReuso) || 0;
            const total = novas + reuso;
            
            const isEsgotado = total === 0;
            const badgeClass = isEsgotado ? 'bg-[rgba(255,69,58,0.15)] text-[#ff453a]' : 'bg-[rgba(48,209,88,0.15)] text-[#30d158]';
            const badgeText = isEsgotado ? 'Esgotado' : 'Em Estoque';
            
            let nomeExibicao = p.peca.toUpperCase();
            if (nomeExibicao === "TOPCOVER" && p.observacao && p.observacao !== "-") {
                nomeExibicao = `${p.observacao.toUpperCase()} <span class="text-[10px] bg-[rgba(10,132,255,0.15)] text-[#64d2ff] px-2 py-0.5 rounded ml-2 font-bold border border-[rgba(10,132,255,0.3)]">TOPCOVER</span>`;
            }

            let obsHtml = '';
            if (p.peca.toUpperCase() !== "TOPCOVER" && p.observacao && p.observacao !== "-") {
                obsHtml = `<span class="block text-[11px] text-[#ff9f0a] font-medium mt-1">Obs: ${p.observacao}</span>`;
            }

            html += `
                <tr class="hover:bg-white/5 transition-colors border-b border-white/5 group">
                    <td class="p-4 align-middle">
                        <strong class="text-[#f5f5f7] font-bold text-sm block">${nomeExibicao}</strong>
                        <span class="text-[#86868b] text-xs">Mod: ${p.modelo}</span>
                        ${obsHtml}
                    </td>
                    <td class="p-4 align-middle text-center">
                        <div class="flex items-center justify-center gap-4 text-[#86868b] text-xs">
                            <span>Novas: <strong class="text-[#64d2ff] text-sm ml-1">${novas}</strong></span>
                            <span>Reuso: <strong class="text-[#64d2ff] text-sm ml-1">${reuso}</strong></span>
                        </div>
                    </td>
                    <td class="p-4 align-middle">
                        <span class="px-3 py-1 rounded-full text-[11px] font-bold tracking-wide ${badgeClass}">${badgeText}</span>
                    </td>
                    <td class="p-4 align-middle">
                        <div class="flex items-center justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                            <select id="tipo-${p.id}" class="bg-[#2c2c2e] text-[#f5f5f7] border border-white/10 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[#0a84ff]">
                                <option value="nova">Nova</option>
                                <option value="reuso">Usada</option>
                            </select>
                            
                            <div class="flex items-center gap-1 bg-[#1c1c1e] p-1 rounded-lg border border-white/5">
                                <button onclick="app.updatePecaQtd('${p.id}', -5)" class="w-7 h-7 flex items-center justify-center bg-[#2c2c2e] hover:bg-[#3a3a3c] text-[#f5f5f7] rounded-md transition-colors text-xs font-bold" title="-5">-5</button>
                                <button onclick="app.updatePecaQtd('${p.id}', -1)" class="w-7 h-7 flex items-center justify-center bg-[#2c2c2e] hover:bg-[#3a3a3c] text-[#f5f5f7] rounded-md transition-colors text-xs font-bold" title="-1">-1</button>
                                <span class="w-8 text-center text-[#f5f5f7] font-bold text-sm mx-1">${total}</span>
                                <button onclick="app.updatePecaQtd('${p.id}', 1)" class="w-7 h-7 flex items-center justify-center bg-[rgba(10,132,255,0.2)] hover:bg-[rgba(10,132,255,0.35)] text-[#64d2ff] rounded-md transition-colors text-xs font-bold" title="+1">+1</button>
                                <button onclick="app.updatePecaQtd('${p.id}', 5)" class="w-7 h-7 flex items-center justify-center bg-[rgba(10,132,255,0.2)] hover:bg-[rgba(10,132,255,0.35)] text-[#64d2ff] rounded-md transition-colors text-xs font-bold" title="+5">+5</button>
                            </div>
                            
                            <button onclick="app.deletePeca('${p.id}')" class="ml-2 w-8 h-8 flex items-center justify-center bg-[rgba(255,69,58,0.15)] hover:bg-[rgba(255,69,58,0.3)] text-[#ff453a] rounded-lg transition-colors" title="Excluir Peça">
                                <span class="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        if(filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center p-8 text-[#86868b] text-sm">Nenhuma peça encontrada no estoque.</td></tr>';
        } else {
            tbody.innerHTML = html;
        }
    },

    openPecaForm() {
        document.getElementById('peca-id').value = '';
        document.getElementById('peca-nome').value = '';
        document.getElementById('peca-modelo').value = '';
        document.getElementById('peca-novas').value = '0';
        document.getElementById('peca-reuso').value = '0';
        document.getElementById('peca-obs').value = '-';
        document.getElementById('peca-form-modal').classList.remove('hidden');
        document.getElementById('peca-form-modal').classList.add('flex');
    },

    closePecaForm() {
        document.getElementById('peca-form-modal').classList.remove('flex');
        document.getElementById('peca-form-modal').classList.add('hidden');
    },

    async savePecaForm() {
        const peca = document.getElementById('peca-nome').value.trim();
        const modelo = document.getElementById('peca-modelo').value.trim();
        const novas = parseInt(document.getElementById('peca-novas').value) || 0;
        const reuso = parseInt(document.getElementById('peca-reuso').value) || 0;
        const obs = document.getElementById('peca-obs').value.trim() || '-';

        if(!peca || !modelo) return app.showToast("Informe a peça e o modelo.", "error");

        app.closePecaForm();
        app.showToast("Salvando na planilha...", "info");

        try {
            await fetch(GOOGLE_SHEETS_API_URL, {
                method: "POST",
                body: JSON.stringify({ action: 'add', peca: peca, modelo: modelo, qtdNovas: novas, qtdReuso: reuso, observacao: obs })
            });
            app.showToast("Peça cadastrada!");
            app.addLog(`➕ Adicionou ${novas+reuso}x ${peca} (${modelo}) no Estoque`, 'Logística');
            app.fetchEstoqueSheet(); // Força o recarregamento na hora
        } catch(e) { console.error(e); app.showToast("Erro ao salvar", "error"); }
    },

    async updatePecaQtd(id, alteracao) {
        const tipoBox = document.getElementById(`tipo-${id}`);
        if(!tipoBox) return;
        const tipo = tipoBox.value; 

        // Encontra a peça no cache atual
        const pIndex = app.allPecas.findIndex(x => String(x.id) === String(id));
        if(pIndex === -1) return;

        // --- ATUALIZAÇÃO OTIMISTA (Muda na tela instantaneamente) ---
        let valNovas = parseInt(app.allPecas[pIndex].qtdNovas) || 0;
        let valReuso = parseInt(app.allPecas[pIndex].qtdReuso) || 0;

        if (tipo === 'nova') {
            if (alteracao < 0 && valNovas === 0) return; // Não deixa ficar negativo
            valNovas += alteracao;
            if(valNovas < 0) valNovas = 0;
            app.allPecas[pIndex].qtdNovas = valNovas;
        } else {
            if (alteracao < 0 && valReuso === 0) return; // Não deixa ficar negativo
            valReuso += alteracao;
            if(valReuso < 0) valReuso = 0;
            app.allPecas[pIndex].qtdReuso = valReuso;
        }
        
        app.allPecas[pIndex].total = valNovas + valReuso;
        app.renderEstoquePage(); 
        app.updateDashboardStats();

        // --- ENVIA PARA A PLANILHA EM SEGUNDO PLANO ---
        try {
            await fetch(GOOGLE_SHEETS_API_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'update', id: id, alteracao: alteracao, tipo: tipo })
            });
            const sinal = alteracao > 0 ? "+" : "";
            app.addLog(`📦 Estoque: ${sinal}${alteracao} ${tipo === 'nova'?'Novas':'Usadas'} em ${app.allPecas[pIndex].peca} (${app.allPecas[pIndex].modelo})`, 'Logística');
        } catch(e) { 
            console.error(e); 
            app.showToast("Falha de conexão com a Planilha.", "error"); 
            app.fetchEstoqueSheet(); // Desfaz a mudança se der erro
        }
    },

    async deletePeca(id) {
        if(confirm("Deseja EXCLUIR definitivamente esta peça da Planilha?")) {
            const p = app.allPecas.find(x => String(x.id) === String(id));
            
            // Otimista
            app.allPecas = app.allPecas.filter(x => String(x.id) !== String(id));
            app.renderEstoquePage();
            app.updateDashboardStats();

            try {
                await fetch(GOOGLE_SHEETS_API_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'delete', id: id })
                });
                app.showToast("Peça excluída do estoque.");
                if(p) app.addLog(`🗑️ Excluiu peça do estoque: ${p.peca} (${p.modelo})`, 'Incidente');
            } catch(e) { 
                console.error(e); 
                app.showToast("Erro.", "error"); 
                app.fetchEstoqueSheet(); // Traz de volta se falhou
            }
        }
    },


    /* =======================================
       SISTEMA DE CHAT DIRETO (DM)
    ======================================= */
    toggleChatPanel() {
        const panel = document.getElementById('global-chat-panel');
        panel.classList.toggle('hidden');
        if(!panel.classList.contains('hidden')) {
            app.closeChatView(); 
        }
    },

    openChatWith(targetUid) {
        app.currentChatId = targetUid;
        document.getElementById('chat-user-list-view').classList.add('hidden');
        document.getElementById('chat-messages-view').classList.remove('hidden');
        document.getElementById('chat-messages-view').classList.add('flex');
        document.getElementById('chat-back-btn').classList.remove('hidden');
        
        const targetUser = app.getUserData(targetUid);
        document.getElementById('chat-header-title').innerText = targetUser.nome;
        
        const avatar = document.getElementById('chat-header-avatar');
        avatar.classList.remove('hidden');
        if(targetUser.foto) {
            avatar.innerHTML = '';
            avatar.style.backgroundImage = `url('${targetUser.foto}')`;
        } else {
            avatar.style.backgroundImage = 'none';
            avatar.innerHTML = targetUser.nome.substring(0,2).toUpperCase();
        }

        const myUid = auth.currentUser.uid;
        const convId = myUid < targetUid ? `${myUid}_${targetUid}` : `${targetUid}_${myUid}`;
        
        if(app.chatUnsub) app.chatUnsub();
        
        const container = document.getElementById('chat-messages-container');
        container.innerHTML = '<div class="text-center text-xs text-on-surface-variant mt-4">Carregando mensagens...</div>';
        
        app.chatUnsub = onSnapshot(collection(db, "chats", convId, "mensagens"), snap => {
            const msgs = snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (a.ts || 0) - (b.ts || 0));
            container.innerHTML = '';
            
            if(msgs.length === 0) {
                container.innerHTML = '<div class="text-center text-xs text-on-surface-variant mt-4">Inicie a conversa!</div>';
                return;
            }
            
            msgs.forEach(m => {
                const isMe = m.authorId === myUid;
                const time = new Date(m.ts).toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'});
                
                if(isMe) {
                    container.innerHTML += `
                        <div class="flex justify-end">
                            <div class="bg-primary text-on-primary px-3 py-2 rounded-xl rounded-tr-sm max-w-[85%] shadow-sm">
                                <p class="text-[13px] whitespace-pre-wrap">${m.text}</p>
                                <span class="text-[9px] opacity-70 block text-right mt-1 font-code-data">${time}</span>
                            </div>
                        </div>
                    `;
                } else {
                    container.innerHTML += `
                        <div class="flex justify-start">
                            <div class="bg-surface-container-high text-on-surface px-3 py-2 rounded-xl rounded-tl-sm max-w-[85%] border border-outline-variant/30 shadow-sm">
                                <p class="text-[13px] whitespace-pre-wrap">${m.text}</p>
                                <span class="text-[9px] text-on-surface-variant block mt-1 font-code-data">${time}</span>
                            </div>
                        </div>
                    `;
                }
            });
            setTimeout(() => container.scrollTop = container.scrollHeight, 100);
        });
    },

    closeChatView() {
        if(app.chatUnsub) { app.chatUnsub(); app.chatUnsub = null; }
        app.currentChatId = null;
        document.getElementById('chat-user-list-view').classList.remove('hidden');
        document.getElementById('chat-messages-view').classList.add('hidden');
        document.getElementById('chat-messages-view').classList.remove('flex');
        document.getElementById('chat-back-btn').classList.add('hidden');
        document.getElementById('chat-header-avatar').classList.add('hidden');
        document.getElementById('chat-header-title').innerText = "Chat da Equipe";
    },

    async sendChatMessage() {
        const inp = document.getElementById('chat-message-inp');
        const text = inp.value.trim();
        if(!text || !app.currentChatId) return;
        
        const myUid = auth.currentUser.uid;
        const targetUid = app.currentChatId;
        const convId = myUid < targetUid ? `${myUid}_${targetUid}` : `${targetUid}_${myUid}`;
        
        inp.value = '';
        
        try {
            await addDoc(collection(db, "chats", convId, "mensagens"), {
                text: text,
                authorId: myUid,
                ts: Date.now()
            });
        } catch(e) { console.error(e); }
    },

    /* =======================================
       CONFIGURAÇÕES (PERFIL E SENHA)
    ======================================= */
    renderConfigPage() {
        if(!auth.currentUser) return;
        const uid = auth.currentUser.uid;
        const user = app.userMap[uid] || {};
        
        const nome = user.nome || auth.currentUser.displayName || '';
        const foto = user.foto || auth.currentUser.photoURL || '';
        const cargo = user.cargo || '';

        document.getElementById('conf-nome').value = nome;
        document.getElementById('conf-foto').value = foto;
        document.getElementById('conf-cargo').value = cargo;
        document.getElementById('conf-pass1').value = '';
        document.getElementById('conf-pass2').value = '';

        const preview = document.getElementById('conf-avatar-preview');
        if(foto) {
            preview.innerText = '';
            preview.style.backgroundImage = `url('${foto}')`;
        } else {
            preview.innerText = nome ? nome.substring(0,2).toUpperCase() : 'TI';
            preview.style.backgroundImage = 'none';
        }
    },

    async saveProfileConfig() {
        const nome = document.getElementById('conf-nome').value.trim();
        const foto = document.getElementById('conf-foto').value.trim();
        const cargo = document.getElementById('conf-cargo').value.trim();

        if(!nome) return app.showToast("O Nome de exibição é obrigatório.", "error");

        try {
            await updateProfile(auth.currentUser, { displayName: nome, photoURL: foto });
            
            await setDoc(doc(db, "usuarios", auth.currentUser.uid), {
                nome: nome,
                foto: foto,
                cargo: cargo
            }, { merge: true });
            
            app.showToast("Perfil atualizado!");
            app.updateAvatar(auth.currentUser, foto, nome, cargo);
            app.renderConfigPage(); 
        } catch(e) {
            console.error(e);
            app.showToast("Erro ao atualizar perfil.", "error");
        }
    },

    async savePasswordConfig() {
        const p1 = document.getElementById('conf-pass1').value;
        const p2 = document.getElementById('conf-pass2').value;

        if(!p1 || p1.length < 6) return app.showToast("A senha precisa ter no mínimo 6 caracteres.", "error");
        if(p1 !== p2) return app.showToast("As senhas digitadas não coincidem.", "error");

        try {
            await updatePassword(auth.currentUser, p1);
            app.showToast("Senha alterada com sucesso!");
            document.getElementById('conf-pass1').value = '';
            document.getElementById('conf-pass2').value = '';
        } catch(e) {
            console.error(e);
            if(e.code === 'auth/requires-recent-login') {
                app.showToast("Por segurança, faça login novamente antes de alterar a senha.", "error");
            } else {
                app.showToast("Erro ao alterar a senha.", "error");
            }
        }
    },

    /* =======================================
       SISTEMA DE LEMBRETES & ALERTAS
    ======================================= */
    listenToReminders() {
        if (app.remindersUnsub) return;
        app.remindersUnsub = onSnapshot(collection(db, "lembretes"), snap => {
            app.allReminders = snap.docs.map(d => ({id: d.id, ...d.data()}));
            
            app.renderDashboard(); 
            if(document.getElementById('page-lembretes').classList.contains('active')) {
                app.renderRemindersPage();
            }
        });

        if (!app.alertCheckInterval) {
            app.alertCheckInterval = setInterval(() => {
                app.checkAlerts();
            }, 10000); 
        }
    },

    playAlarmEngine() {
        if(this.audioCtx) {
            if(this.audioCtx.state === 'suspended') this.audioCtx.resume();
            this.beepInterval = setInterval(() => {
                const osc = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();
                osc.connect(gain);
                gain.connect(this.audioCtx.destination);
                osc.type = 'square';
                osc.frequency.setValueAtTime(800, this.audioCtx.currentTime); 
                gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
                osc.start();
                osc.stop(this.audioCtx.currentTime + 0.3); 
            }, 1000); 
        }
        
        this.blinkInterval = setInterval(() => {
            document.title = document.title === "🔴 ALERTA T.I!" ? "WORKSPACE LOGÍSTICA" : "🔴 ALERTA T.I!";
        }, 1000);
    },

    stopAlarmEngine() {
        if(this.beepInterval) { clearInterval(this.beepInterval); this.beepInterval = null; }
        if(this.blinkInterval) { clearInterval(this.blinkInterval); this.blinkInterval = null; document.title = "WORKSPACE LOGÍSTICA"; }
    },

    checkAlerts() {
        if(!document.getElementById('reminder-alert-overlay').classList.contains('hidden')) return; 

        const now = new Date();
        const currentUid = auth.currentUser ? auth.currentUser.uid : null;
        if(!currentUid) return;

        const alertToShow = app.allReminders.find(r => {
            let assigns = r.assignees || (r.author ? [r.author] : []);
            if(r.type === 'Alerta' && r.status !== 'Concluído' && assigns.includes(currentUid) && r.date && r.time) {
                const rDate = new Date(`${r.date}T${r.time}`);
                return now >= rDate;
            }
            return false;
        });

        if(alertToShow && app.activeAlertId !== alertToShow.id) {
            app.activeAlertId = alertToShow.id; 
            document.getElementById('alert-rem-id').value = alertToShow.id;
            document.getElementById('alert-rem-title').innerText = alertToShow.title;
            document.getElementById('alert-rem-desc').innerText = alertToShow.desc || 'Hora do seu alerta!';
            document.getElementById('reminder-alert-overlay').classList.remove('hidden');

            app.playAlarmEngine();

            if ("Notification" in window && Notification.permission === "granted") {
                const notif = new Notification("ALERTA T.I: " + alertToShow.title, {
                    body: alertToShow.desc || "Clique aqui para retornar ao Workspace.",
                    requireInteraction: true,
                    icon: "https://cdn-icons-png.flaticon.com/512/565/565422.png" 
                });
                notif.onclick = function() {
                    window.focus(); 
                    this.close();
                };
            }
        }
    },

    updateReminderFilters() {
        app.reminderFilterStatus = document.getElementById('rem-filter-status').value;
        app.reminderFilterDate = document.getElementById('rem-filter-date').value;
        app.reminderFilterOperator = document.getElementById('rem-filter-operator').value;
        app.renderRemindersPage();
    },

    clearReminderFilters() {
        document.getElementById('rem-filter-status').value = 'Em aberto';
        document.getElementById('rem-filter-date').value = '';
        document.getElementById('rem-filter-operator').value = 'Todos';
        app.reminderFilterStatus = 'Em aberto';
        app.reminderFilterDate = '';
        app.reminderFilterOperator = 'Todos';
        app.renderRemindersPage();
    },

    openReminderForm(id = null) {
        if (id) {
            const r = app.allReminders.find(x => x.id === id);
            if(!r) return;
            document.getElementById('reminder-form-title').innerText = "Editar Lembrete";
            document.getElementById('rem-id').value = r.id;
            document.getElementById('rem-title').value = r.title || "";
            document.getElementById('rem-desc').value = r.desc || "";
            document.getElementById('rem-date').value = r.date || "";
            document.getElementById('rem-time').value = r.time || "";
            document.getElementById('rem-type').value = r.type || "Nota";
            document.getElementById('rem-repeat').value = r.repeat || "none";
            
            let assigns = r.assignees || (r.author ? [r.author] : []);
            document.querySelectorAll('input[name="rem-assignees"]').forEach(cb => {
                cb.checked = assigns.includes(cb.value);
            });
        } else {
            document.getElementById('reminder-form-title').innerText = "Novo Lembrete";
            document.getElementById('rem-id').value = "";
            document.getElementById('rem-title').value = "";
            document.getElementById('rem-desc').value = "";
            document.getElementById('rem-date').value = app.getTodayStr();
            document.getElementById('rem-time').value = new Date().toTimeString().slice(0,5);
            document.getElementById('rem-type').value = "Nota";
            document.getElementById('rem-repeat').value = "none";
            
            document.querySelectorAll('input[name="rem-assignees"]').forEach(cb => cb.checked = false);
            const myCb = document.querySelector(`input[name="rem-assignees"][value="${auth.currentUser.uid}"]`);
            if(myCb) myCb.checked = true;
        }
        document.getElementById('reminder-form-modal').classList.remove('hidden');
    },

    closeReminderForm() {
        document.getElementById('reminder-form-modal').classList.add('hidden');
    },

    advanceRepeatingReminder(r) {
        let dateObj = new Date(`${r.date}T${r.time}`);
        const now = new Date();
        let advancedOnce = false;
        
        while (dateObj <= now || !advancedOnce) {
            if (r.repeat === '5m') dateObj.setMinutes(dateObj.getMinutes() + 5);
            else if (r.repeat === '10m') dateObj.setMinutes(dateObj.getMinutes() + 10);
            else if (r.repeat === '30m') dateObj.setMinutes(dateObj.getMinutes() + 30);
            else if (r.repeat === '1h') dateObj.setHours(dateObj.getHours() + 1);
            else if (r.repeat === '1d') dateObj.setDate(dateObj.getDate() + 1);
            else break;
            advancedOnce = true;
        }

        const newDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
        const newTime = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
        return { newDate, newTime };
    },

    async saveReminderForm() {
        const id = document.getElementById('rem-id').value;
        const title = document.getElementById('rem-title').value;
        const desc = document.getElementById('rem-desc').value;
        const date = document.getElementById('rem-date').value;
        const time = document.getElementById('rem-time').value;
        const type = document.getElementById('rem-type').value;
        const repeat = document.getElementById('rem-repeat').value;
        
        let assigneesList = Array.from(document.querySelectorAll('input[name="rem-assignees"]:checked')).map(cb => cb.value);
        if(assigneesList.length === 0) assigneesList.push(auth.currentUser.uid); 

        if(!title) return app.showToast("O título é obrigatório.", "error");

        const remData = {
            title, desc, date, time, type, repeat,
            status: 'Em aberto',
            author: auth.currentUser.uid, 
            assignees: assigneesList, 
            ts_manual: Date.now()
        };

        try {
            if(id) {
                await updateDoc(doc(db, "lembretes", id), remData);
                app.showToast("Lembrete atualizado!");
                app.addLog(`✏️ Atualizou o lembrete/alerta: ${title}`, 'Logística');
            } else {
                await addDoc(collection(db, "lembretes"), remData);
                app.showToast("Lembrete agendado!");
                app.addLog(`➕ Criou um novo lembrete/alerta: ${title}`, 'Logística');
            }
            app.closeReminderForm();
        } catch(e) { console.error(e); app.showToast("Erro ao agendar.", "error"); }
    },

    async deleteReminder(id) {
        if(confirm("Deseja realmente apagar este lembrete/alerta?")) {
            try {
                const r = app.allReminders.find(x => x.id === id);
                await deleteDoc(doc(db, "lembretes", id));
                app.showToast("Lembrete apagado.");
                if(r) app.addLog(`🗑️ Excluiu o lembrete/alerta: ${r.title}`, 'Logística');
            } catch(e) { console.error(e); app.showToast("Erro.", "error"); }
        }
    },

    async completeReminder(id) {
        try {
            const r = app.allReminders.find(x => x.id === id);
            
            if (r.status === 'Em aberto' && r.repeat && r.repeat !== 'none') {
                const next = app.advanceRepeatingReminder(r);
                await updateDoc(doc(db, "lembretes", id), { date: next.newDate, time: next.newTime });
                app.showToast(`Avançado para as ${next.newTime}`, "info");
                app.addLog(`🔄 Lembrete/alerta recorrente "${r.title}" avançou para ${next.newTime}`, 'Logística');
                return;
            }

            const newStatus = r.status === 'Concluído' ? 'Em aberto' : 'Concluído';
            await updateDoc(doc(db, "lembretes", id), { status: newStatus });
            app.showToast(newStatus === 'Concluído' ? "Concluído!" : "Reaberto!");
            
            if (newStatus === 'Concluído') {
                app.addLog(`✅ Concluiu o lembrete/alerta: ${r.title}`, 'Logística');
            } else {
                app.addLog(`🔄 Reabriu o lembrete/alerta: ${r.title}`, 'Logística');
            }
        } catch(e) { console.error(e); }
    },

    async completeAlert() {
        const id = document.getElementById('alert-rem-id').value;
        if(id) {
            const r = app.allReminders.find(x => x.id === id);
            
            if (r && r.repeat && r.repeat !== 'none') {
                const next = app.advanceRepeatingReminder(r);
                await updateDoc(doc(db, "lembretes", id), { date: next.newDate, time: next.newTime });
                app.addLog(`🔄 Alerta recorrente "${r.title}" avançou para as ${next.newTime}`, 'Logística');
            } else {
                await updateDoc(doc(db, "lembretes", id), { status: 'Concluído' });
                if(r) app.addLog(`✅ Concluiu o alerta: ${r.title}`, 'Logística');
            }
            
            app.activeAlertId = null; 
            app.stopAlarmEngine();
            document.getElementById('reminder-alert-overlay').classList.add('hidden');
        }
    },

    async snoozeAlert() {
        const id = document.getElementById('alert-rem-id').value;
        if(!id) return;

        const r = app.allReminders.find(x => x.id === id);
        if(!r || !r.time) return;

        let [hours, minutes] = r.time.split(':').map(Number);
        minutes += 10;
        if(minutes >= 60) {
            hours = (hours + 1) % 24;
            minutes -= 60;
        }
        const newTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

        try {
            await updateDoc(doc(db, "lembretes", id), { time: newTime });
            app.activeAlertId = null; 
            app.stopAlarmEngine();
            document.getElementById('reminder-alert-overlay').classList.add('hidden');
            app.showToast(`Adiado para as ${newTime}`, "info");
            app.addLog(`🔄 Adiou o alerta "${r.title}" para as ${newTime}`, 'Logística');
        } catch(e) { console.error(e); }
    },

    renderRemindersPage() {
        const notesList = document.getElementById('reminders-notes-list');
        const alertsList = document.getElementById('reminders-alerts-list');
        if(!notesList || !alertsList) return;

        let myRems = app.allReminders;

        if(app.reminderFilterStatus !== 'Todos') {
            myRems = myRems.filter(r => r.status === app.reminderFilterStatus);
        }
        if (app.reminderFilterOperator !== 'Todos') {
            myRems = myRems.filter(r => (r.assignees && r.assignees.includes(app.reminderFilterOperator)) || r.author === app.reminderFilterOperator);
        }
        if (app.reminderFilterDate) {
            myRems = myRems.filter(r => r.date === app.reminderFilterDate);
        }

        myRems.sort((a,b) => {
            const dA = new Date(`${a.date || '9999-12-31'}T${a.time || '23:59'}`);
            const dB = new Date(`${b.date || '9999-12-31'}T${b.time || '23:59'}`);
            return dA - dB;
        });

        let notesHtml = '';
        let alertsHtml = '';

        myRems.forEach(r => {
            const dStr = r.date ? r.date.split('-').reverse().join('/') : '--/--/----';
            const tStr = r.time ? r.time : '--:--';
            
            let assigneesToRender = r.assignees || (r.author ? [r.author] : []);
            let avatarHtml = '<div class="flex -space-x-2">';
            assigneesToRender.forEach(uid => {
                const u = app.getUserData(uid);
                avatarHtml += u.foto 
                    ? `<img src="${u.foto}" class="w-6 h-6 rounded-full object-cover shadow-sm border-2 border-[#232323]" title="${u.nome}">` 
                    : `<div class="w-6 h-6 rounded-full bg-surface-variant flex items-center justify-center text-[9px] font-bold text-on-surface border-2 border-[#232323]" title="${u.nome}">${u.nome.substring(0,2).toUpperCase()}</div>`;
            });
            avatarHtml += '</div>';

            const isDone = r.status === 'Concluído';
            const doneStyles = isDone ? 'opacity-60 grayscale' : '';
            const doneBadge = isDone ? `<span class="text-[10px] font-black bg-green-500/20 text-green-700 px-2 py-0.5 rounded-full mb-2 inline-block border border-green-500/30">✅ CONCLUÍDO</span>` : '';

            let repeatIcon = '';
            if (r.repeat && r.repeat !== 'none') {
                const repText = r.repeat === '5m' ? '5 min' : r.repeat === '10m' ? '10 min' : r.repeat === '30m' ? '30 min' : r.repeat === '1h' ? '1 hora' : '1 dia';
                repeatIcon = `<span class="text-[9px] font-bold bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded flex items-center gap-0.5 w-max whitespace-nowrap" title="Repetir"><span class="material-symbols-outlined text-[10px]">repeat</span> ${repText}</span>`;
            }

            if(r.type === 'Nota') {
                notesHtml += `
                    <div class="bg-yellow-200 text-yellow-900 rounded-lg shadow-md relative group transition-all border border-yellow-300 flex flex-col min-h-[140px] ${doneStyles}">
                        <span class="material-symbols-outlined absolute -top-3 left-1/2 -translate-x-1/2 text-red-500 drop-shadow-md text-3xl z-10">push_pin</span>
                        
                        <div class="p-4 flex-1 flex flex-col">
                            <div class="flex items-center gap-2 mb-2 mt-2">
                                ${avatarHtml}
                                <h4 class="font-bold text-sm leading-tight flex-1 truncate ${isDone ? 'line-through' : ''}">${r.title}</h4>
                            </div>
                            ${doneBadge}
                            <p class="text-[13px] opacity-90 leading-relaxed whitespace-pre-wrap">${r.desc || ''}</p>
                        </div>
                        
                        <div class="p-2 px-3 border-t border-yellow-400/30 flex justify-between items-end gap-2 bg-yellow-300/30 rounded-b-lg">
                            <div class="text-[10px] font-bold opacity-80 flex flex-col gap-1 items-start min-w-0">
                                <span class="flex items-center gap-1 whitespace-nowrap"><span class="material-symbols-outlined text-[12px]">schedule</span> ${dStr} às ${tStr}</span>
                                ${repeatIcon}
                            </div>
                            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <button onclick="app.openReminderForm('${r.id}')" class="p-1 hover:bg-yellow-400/50 rounded text-yellow-800" title="Editar"><span class="material-symbols-outlined text-[16px]">edit</span></button>
                                <button onclick="app.completeReminder('${r.id}')" class="p-1 hover:bg-green-500/30 rounded text-green-700" title="${isDone ? 'Reabrir' : 'Concluir/Avançar'}"><span class="material-symbols-outlined text-[16px]">${isDone ? 'replay' : 'check'}</span></button>
                                <button onclick="app.deleteReminder('${r.id}')" class="p-1 hover:bg-red-500/30 rounded text-red-700" title="Excluir"><span class="material-symbols-outlined text-[16px]">delete</span></button>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                alertsHtml += `
                    <div class="glass-panel p-4 rounded-xl border border-outline-variant/30 flex items-center justify-between shadow-sm transition-colors group ${isDone ? 'opacity-60 grayscale border-green-500/30' : 'hover:border-red-400/50'}">
                        <div class="flex-1 min-w-0 pr-4">
                            <div class="flex items-center gap-2 mb-1">
                                ${isDone 
                                    ? `<span class="px-2 py-0.5 rounded text-[9px] font-bold bg-green-500/20 text-green-500 flex items-center w-max gap-1 border border-green-500/20">✅ CONCLUÍDO</span>`
                                    : `<span class="px-2 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400 flex items-center w-max gap-1 border border-red-500/20"><span class="material-symbols-outlined text-[12px]">notifications_active</span> ALERTA</span>`
                                }
                                ${avatarHtml}
                            </div>
                            <h4 class="font-bold text-base text-on-surface truncate ${isDone ? 'line-through text-on-surface-variant' : ''}">${r.title}</h4>
                            
                            <div class="text-xs text-on-surface-variant font-code-data mt-1 flex items-center flex-wrap gap-2">
                                <span class="flex items-center gap-1 whitespace-nowrap">
                                    <span class="material-symbols-outlined text-[14px]">schedule</span> 
                                    Dispara em: ${dStr} às <span class="font-bold text-on-surface">${tStr}</span>
                                </span>
                                ${repeatIcon}
                            </div>
                        </div>
                        
                        <div class="flex gap-1 border-l border-outline-variant/30 pl-3 shrink-0 flex-wrap justify-end max-w-[90px] sm:max-w-none">
                            <button onclick="app.openReminderForm('${r.id}')" class="p-1.5 hover:bg-surface-variant rounded-lg text-on-surface-variant hover:text-primary transition-colors" title="Editar"><span class="material-symbols-outlined text-[18px]">edit</span></button>
                            <button onclick="app.completeReminder('${r.id}')" class="p-1.5 ${isDone ? 'hover:bg-yellow-500/20 text-yellow-500' : 'hover:bg-green-500/20 text-green-500'} rounded-lg transition-colors" title="${isDone ? 'Reabrir' : 'Concluir/Avançar'}"><span class="material-symbols-outlined text-[18px]">${isDone ? 'replay' : 'check'}</span></button>
                            <button onclick="app.deleteReminder('${r.id}')" class="p-1.5 hover:bg-error-container/20 rounded-lg text-on-surface-variant hover:text-error transition-colors" title="Excluir"><span class="material-symbols-outlined text-[18px]">delete</span></button>
                        </div>
                    </div>
                `;
            }
        });

        notesList.innerHTML = notesHtml || '<p class="text-xs text-on-surface-variant/50 italic col-span-2 p-4 text-center border border-dashed border-outline-variant rounded-xl">Sua mesa está limpa. Nenhuma nota.</p>';
        alertsList.innerHTML = alertsHtml || '<p class="text-xs text-on-surface-variant/50 italic p-4 text-center border border-dashed border-outline-variant rounded-xl">Nenhum alerta listado.</p>';
    },

    /* =======================================
       CALCULADORA OPERACIONAL
    ======================================= */
    calcAppend(val) {
        if (this.calcCurrent === '0' && val !== '.') {
            this.calcCurrent = val;
        } else {
            this.calcCurrent += val;
        }
        this.updateCalcDisplay();
    },

    calcClear() {
        this.calcCurrent = '0';
        this.calcPrevious = '';
        this.updateCalcDisplay();
    },

    calcDelete() {
        if (this.calcCurrent.length > 1) {
            this.calcCurrent = this.calcCurrent.slice(0, -1);
        } else {
            this.calcCurrent = '0';
        }
        this.updateCalcDisplay();
    },

    calcCompute() {
        try {
            let expr = this.calcCurrent.replace(/×/g, '*').replace(/÷/g, '/');
            
            expr = expr.replace(/(\d+(?:\.\d+)?)\s*([\+\-])\s*(\d+(?:\.\d+)?)%/g, (match, p1, p2, p3) => {
                return `${p1}${p2}(${p1}*${p3}/100)`;
            });
            expr = expr.replace(/(\d+(?:\.\d+)?)\s*([\*\/])\s*(\d+(?:\.\d+)?)%/g, (match, p1, p2, p3) => {
                return `${p1}${p2}(${p3}/100)`;
            });
            expr = expr.replace(/(\d+(?:\.\d+)?)%/g, (match, p1) => {
                return `(${p1}/100)`;
            });

            let result = eval(expr);
            if (!isFinite(result)) result = 'Erro';
            
            if (result !== 'Erro') {
                result = parseFloat(result.toFixed(6));
            }
            
            this.calcPrevious = this.calcCurrent + ' =';
            this.calcCurrent = String(result);
            this.updateCalcDisplay();
        } catch (e) {
            this.calcCurrent = 'Erro';
            this.updateCalcDisplay();
        }
    },

    updateCalcDisplay() {
        const curEl = document.getElementById('calc-current');
        const prevEl = document.getElementById('calc-previous');
        if (curEl) curEl.innerText = this.calcCurrent;
        if (prevEl) prevEl.innerText = this.calcPrevious;
    },

    /* =======================================
       DIÁRIO DE BORDO
    ======================================= */
    async addLog(msg, manualCategory = null) { 
        try { 
            await addDoc(collection(db, "notificacoes"), { 
                text: msg, 
                author: auth.currentUser.displayName || auth.currentUser.email, 
                ts: Date.now(),
                category: manualCategory,
                isManual: manualCategory !== null 
            }); 
        } catch(e) { console.error(e); } 
    },

    async saveManualLog() {
        const text = document.getElementById('log-text-inp').value;
        const cat = document.getElementById('log-category-inp').value;
        const editId = document.getElementById('edit-log-id').value;

        if(!text.trim()) { app.showToast("Escreva algo no registro", "error"); return; }
        
        try {
            if (editId) {
                await updateDoc(doc(db, "notificacoes", editId), { text: text, category: cat });
                app.showToast("Registro atualizado!");
            } else {
                await addDoc(collection(db, "notificacoes"), { 
                    text: text, 
                    author: auth.currentUser.uid, 
                    ts: Date.now(),
                    category: cat,
                    isManual: true 
                }); 
                app.showToast("Registro adicionado ao Diário!");
            }
            document.getElementById('modal-log-form').classList.add('hidden');
        } catch(e) { console.error(e); app.showToast("Erro ao salvar", "error"); }
    },

    async deleteLog(id) {
        if(confirm("Deseja realmente excluir este registro manual?")) {
            try {
                await deleteDoc(doc(db, "notificacoes", id));
                app.showToast("Registro excluído.");
            } catch(e) { console.error(e); app.showToast("Erro ao excluir", "error"); }
        }
    },

    openNewLogModal() {
        document.getElementById('edit-log-id').value = '';
        document.getElementById('log-text-inp').value = '';
        document.getElementById('log-category-inp').value = 'Logística';
        document.getElementById('modal-log-form').classList.remove('hidden');
    },

    openEditLog(id) {
        const log = app.allLogs.find(l => l.id === id);
        if(!log) return;
        document.getElementById('edit-log-id').value = id;
        document.getElementById('log-category-inp').value = log.category || 'Logística';
        document.getElementById('log-text-inp').value = log.text;
        document.getElementById('modal-log-form').classList.remove('hidden');
    },
    
    listenToNotifications() {
        if (app.globalNotifsUnsub) return;
        app.globalNotifsUnsub = onSnapshot(collection(db, "notificacoes"), snap => {
            app.allLogs = snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.ts || 0) - (a.ts || 0));
            app.renderDashboardLogs();
            app.renderLogbook();
        });
    },

    renderDashboardLogs() {
        const dashList = document.getElementById('dashboard-log-list'); 
        if(!dashList) return;
        
        let dashHtml = '';
        app.allLogs.slice(0, 5).forEach(dt => {
            const time = dt.ts ? new Date(dt.ts).toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'}) : '--:--';
            const userL = app.getUserData(dt.author);
            const displayName = userL.nome !== 'Desconhecido' ? userL.nome : (dt.author || 'Sistema');
            
            dashHtml += `
                <li class="p-4 hover:bg-surface-variant/30 transition-colors flex gap-4 border-b border-outline-variant/30">
                    <div class="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center shrink-0 border border-outline-variant/50">
                        <span class="font-code-data text-xs text-primary-fixed-dim">${time}</span>
                    </div>
                    <div class="flex-1 pt-1">
                        <div class="flex items-baseline gap-2 mb-1">
                            <span class="font-code-data text-sm font-semibold text-on-surface">${displayName}</span>
                        </div>
                        <p class="font-body-sm text-body-sm text-on-surface-variant truncate">${dt.text || ''}</p>
                    </div>
                </li>
            `;
        });
        dashList.innerHTML = dashHtml || '<p class="p-6 text-center text-xs text-on-surface-variant/50 italic">Nenhum log recente.</p>';
    },

    updateLogFilters() {
        this.logDateFilter = document.getElementById('log-date-filter').value;
        this.logOperatorFilter = document.getElementById('log-operator-filter').value;
        this.renderLogbook(); 
    },

    setLogFilter(filter) {
        this.logFilter = filter;
        document.querySelectorAll('.log-filter-btn').forEach(b => {
            if(b.id === `filter-${filter}`) {
                b.className = "log-filter-btn px-sm py-1 rounded-full border border-primary text-primary bg-primary-container/10 font-label-caps whitespace-nowrap";
            } else {
                b.className = "log-filter-btn px-sm py-1 rounded-full border border-outline-variant text-on-surface-variant hover:border-outline hover:text-on-surface font-label-caps whitespace-nowrap transition-colors";
            }
        });
        this.renderLogbook(); 
    },

    renderLogbook() {
        const logbookList = document.getElementById('logbook-feed-list');
        const countBadge = document.getElementById('logbook-today-count');
        if(!logbookList) return;

        const isLogManual = (log) => {
            if (log.isManual) return true;
            const isAction = log.text && log.text.match(/^[➕✏️🗑️🔄✅⭕📎📦]/);
            return !isAction;
        };

        let filteredLogs = app.allLogs;
        
        if(app.logFilter === 'Manuais') {
            filteredLogs = filteredLogs.filter(l => isLogManual(l));
        } else if (app.logFilter !== 'Todos') {
            filteredLogs = filteredLogs.filter(l => {
                let cat = l.category || 'Logística';
                if (cat === 'Logistics') cat = 'Logística';
                if (cat === 'Maintenance') cat = 'Manutenção';
                if (cat === 'Incident') cat = 'Incidente';
                return cat === app.logFilter;
            });
        }

        if (app.logDateFilter) {
            filteredLogs = filteredLogs.filter(l => {
                const d = new Date(l.ts);
                const logDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                return logDateStr === app.logDateFilter;
            });
        }

        if (app.logOperatorFilter && app.logOperatorFilter !== "Todos") {
            filteredLogs = filteredLogs.filter(l => l.author === app.logOperatorFilter);
        }

        let todayCount = 0;
        const todayStr = new Date().toDateString();
        let logbookHtml = '';

        filteredLogs.forEach(dt => {
            const dateObj = new Date(dt.ts);
            if(dateObj.toDateString() === todayStr) todayCount++;

            const time = dt.ts ? dateObj.toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'}) : '--:--';
            
            let category = dt.category || 'Logística';
            if (category === 'Logistics') category = 'Logística';
            if (category === 'Maintenance') category = 'Manutenção';
            if (category === 'Incident') category = 'Incidente';

            let title = 'Registro Manual';
            let colorClass = 'text-primary';
            let bgClass = 'bg-primary';
            let bgLightClass = 'bg-primary-container/10';

            const reallyManual = isLogManual(dt);

            if(!reallyManual) {
                const isAction = dt.text.match(/^[➕✏️🗑️🔄✅⭕📎📦]/);
                if(isAction) {
                    const icon = isAction[0];
                    if(icon === '➕') { title = 'Nova Demanda'; category = 'Logística'; }
                    else if(icon === '✏️' || icon === '🔄') { title = 'Atualização no Sistema'; category = 'Manutenção'; }
                    else if(icon === '🗑️') { title = 'Exclusão Registrada'; category = 'Incidente'; }
                    else if(icon === '✅') { title = 'Tarefa Concluída'; category = 'Logística'; }
                    else if(icon === '📦') { title = 'Movimentação de Estoque'; category = 'Logística'; }
                    else { title = 'Ação de Sistema'; }
                }
            }

            if(category === 'Manutenção') { colorClass = 'text-amber-400'; bgClass = 'bg-amber-400'; bgLightClass = 'bg-amber-400/10'; }
            if(category === 'Incidente') { colorClass = 'text-error'; bgClass = 'bg-error'; bgLightClass = 'bg-error-container/20'; }
            if(category === 'Logística') { colorClass = 'text-tertiary'; bgClass = 'bg-tertiary'; bgLightClass = 'bg-tertiary-container/20'; }

            const userL = app.getUserData(dt.author);
            const displayName = userL.nome !== 'Desconhecido' ? userL.nome : (dt.author || 'Sistema');
            let avatarHtml = `<div class="w-full h-full flex items-center justify-center bg-surface-variant text-on-surface text-[10px] font-bold">${displayName.substring(0,2).toUpperCase()}</div>`;
            if(userL.foto) { avatarHtml = `<img src="${userL.foto}" class="w-full h-full object-cover">`; }

            let actionBtns = '';
            if (reallyManual) {
                actionBtns = `
                    <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button onclick="app.openEditLog('${dt.id}')" class="p-1.5 bg-surface-container-high rounded-md text-on-surface-variant hover:text-primary transition-colors shadow-sm" title="Editar"><span class="material-symbols-outlined text-[16px]">edit</span></button>
                        <button onclick="app.deleteLog('${dt.id}')" class="p-1.5 bg-surface-container-high rounded-md text-on-surface-variant hover:text-error transition-colors shadow-sm" title="Excluir"><span class="material-symbols-outlined text-[16px]">delete</span></button>
                    </div>
                `;
            }

            logbookHtml += `
                <div class="bg-surface-container-low border border-outline-variant rounded-lg p-md shadow-sm relative overflow-hidden group hover:border-outline transition-colors">
                    <div class="absolute left-0 top-0 bottom-0 w-1 ${bgClass}"></div>
                    ${actionBtns}
                    <div class="flex justify-between items-start mb-sm pl-xs pr-14">
                        <div class="flex items-center gap-sm">
                            <span class="font-code-data text-on-surface-variant bg-surface-container px-2 py-1 rounded text-sm">${time}</span>
                            <div class="flex items-center gap-xs">
                                <div class="w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center border border-outline-variant overflow-hidden">
                                    ${avatarHtml}
                                </div>
                                <span class="font-body-sm text-on-surface font-medium">${displayName}</span>
                            </div>
                        </div>
                        <span class="font-label-caps ${colorClass} ${bgLightClass} px-2 py-1 rounded flex items-center gap-xs">
                            <span class="w-1.5 h-1.5 rounded-full ${bgClass}"></span>
                            ${category}
                        </span>
                    </div>
                    <h3 class="font-title-md text-on-surface mb-xs pl-xs">${title}</h3>
                    <p class="font-body-sm text-on-surface-variant pl-xs whitespace-pre-wrap">${dt.text}</p>
                </div>
            `;
        });

        logbookList.innerHTML = logbookHtml || '<p class="p-6 text-center text-xs text-on-surface-variant/50 italic">Nenhum registro encontrado.</p>';
        if(countBadge) countBadge.innerText = todayCount;
    },

    /* =======================================
       GERENCIADOR DE ARMÁRIOS (LOCKERS)
    ======================================= */
    listenToLockers() {
        if(app.lockersUnsub) return;
        app.lockersUnsub = onSnapshot(collection(db, "armarios"), snap => {
            app.allLockers = snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => a.name.localeCompare(b.name));
            app.updateDashboardStats(); 
            if(document.getElementById('page-armarios').classList.contains('active')) {
                app.renderLockers();
                if(app.currentLockerId) app.renderNotebooks();
            }
        });
    },

    updateDashboardStats() {
        let total = 0;
        const counts = {
            'Disponível': 0, 'Laboratório': 0, 'Laboratório 2': 0, 'Para venda': 0,
            'Descarte': 0, 'Garantia': 0, 'Uso interno': 0, 'Repatrimoniar': 0
        };
        
        app.allLockers.forEach(locker => {
            if(locker.equipamentos) {
                total += locker.equipamentos.length;
                locker.equipamentos.forEach(e => {
                    const st = e.statusText;
                    if(counts[st] !== undefined) counts[st]++;
                });
            }
        });
        
        const elTot = document.getElementById('dash-tot-equips');
        if(elTot) elTot.innerText = total;

        const updateDom = (id, count) => {
            const el = document.getElementById(id);
            if(el) el.innerText = count;
        };

        updateDom('dash-stat-disp', counts['Disponível']);
        updateDom('dash-stat-lab1', counts['Laboratório']);
        updateDom('dash-stat-lab2', counts['Laboratório 2']);
        updateDom('dash-stat-venda', counts['Para venda']);
        updateDom('dash-stat-desc', counts['Descarte']);
        updateDom('dash-stat-gar', counts['Garantia']);
        updateDom('dash-stat-uso', counts['Uso interno']);
        updateDom('dash-stat-rep', counts['Repatrimoniar']);
        
        const chart = document.getElementById('dash-chart-bg');
        if(chart) {
            if(total === 0) {
                chart.style.background = `conic-gradient(#353535 0% 100%)`;
            } else {
                const colors = {
                    'Disponível': '#14b8a6', 'Laboratório': '#fbbf24', 'Laboratório 2': '#f97316', 
                    'Para venda': '#3b82f6', 'Descarte': '#ef4444', 'Garantia': '#c084fc', 
                    'Uso interno': '#2dd4bf', 'Repatrimoniar': '#9ca3af'
                };
                let gradientStr = [];
                let currentDeg = 0;
                for (const [key, count] of Object.entries(counts)) {
                    if (count > 0) {
                        const deg = (count / total) * 360;
                        const start = currentDeg;
                        const end = currentDeg + deg;
                        gradientStr.push(`${colors[key]} ${start}deg ${end}deg`);
                        currentDeg = end;
                    }
                }
                chart.style.background = `conic-gradient(${gradientStr.join(', ')})`;
            }
        }

        // Estatísticas de Peças (Estoque)
        let totalPecas = 0;
        const pecasMap = {}; 

        app.allPecas.forEach(p => {
            const sum = (parseInt(p.qtdNovas) || 0) + (parseInt(p.qtdReuso) || 0);
            if (sum > 0) {
                totalPecas += sum;
                const nome = p.peca.toUpperCase();
                pecasMap[nome] = (pecasMap[nome] || 0) + sum;
            }
        });

        const elTotPecas = document.getElementById('dash-tot-pecas');
        if (elTotPecas) elTotPecas.innerText = totalPecas;

        const chartPecas = document.getElementById('dash-pecas-chart-bg');
        const legendPecas = document.getElementById('dash-pecas-legenda');

        if (chartPecas && legendPecas) {
            if (totalPecas === 0) {
                chartPecas.style.background = `conic-gradient(#353535 0% 100%)`;
                legendPecas.innerHTML = '<span class="col-span-2 text-center text-[10px] text-on-surface-variant">Estoque Vazio</span>';
            } else {
                const palette = ['#0a84ff', '#30d158', '#ff9f0a', '#ff453a', '#bf5af2', '#64d2ff', '#ffd60a', '#ff375f', '#32ade6'];
                let gradientStr = [];
                let currentDeg = 0;
                let colorIdx = 0;
                let legendHtml = '';

                const sortedPecas = Object.entries(pecasMap).sort((a,b) => b[1] - a[1]);

                sortedPecas.forEach(([nome, count]) => {
                    const color = palette[colorIdx % palette.length];
                    const deg = (count / totalPecas) * 360;
                    const start = currentDeg;
                    const end = currentDeg + deg;
                    gradientStr.push(`${color} ${start}deg ${end}deg`);
                    currentDeg = end;

                    legendHtml += `<div class="flex justify-between items-center p-1.5 rounded bg-[#232323] border border-outline-variant/30"><span class="flex items-center gap-1.5 truncate"><span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${color};"></span><span class="truncate">${nome}</span></span><span class="font-bold" style="color: ${color}">${count}</span></div>`;
                    colorIdx++;
                });

                chartPecas.style.background = `conic-gradient(${gradientStr.join(', ')})`;
                legendPecas.innerHTML = legendHtml;
            }
        }
    },

    setLockerFilter(filter) {
        app.lockerFilter = filter;
        document.getElementById('locker-filter-1').className = filter === '1-andar' 
            ? "px-4 py-2 border border-primary text-primary bg-primary-container/10 rounded-lg shadow-sm font-bold transition-colors" 
            : "px-4 py-2 bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg shadow-sm font-bold hover:bg-surface-container-highest transition-colors";
        
        document.getElementById('locker-filter-2').className = filter === 'mezanino' 
            ? "px-4 py-2 border border-primary text-primary bg-primary-container/10 rounded-lg shadow-sm font-bold transition-colors" 
            : "px-4 py-2 bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg shadow-sm font-bold hover:bg-surface-container-highest transition-colors";
        
        app.renderLockers();
    },

    renderLockers() {
        const grid = document.getElementById('locker-grid');
        if(!grid) return;
        grid.innerHTML = ''; 

        app.allLockers.forEach((locker) => {
            if (app.lockerFilter !== 'todos' && locker.zoneClass !== app.lockerFilter) return;

            const itemsCount = locker.equipamentos ? locker.equipamentos.length : 0;
            const capacity = Math.min(Math.round((itemsCount / 15) * 100), 100); 

            grid.insertAdjacentHTML('beforeend', `
                <div class="glass-panel relative rounded-xl shadow-sm p-5 md:p-6 border hover:border-primary hover:-translate-y-1 transition-all cursor-pointer group" onclick="app.openLocker('${locker.id}')">
                    <div class="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onclick="app.openLockerForm('${locker.id}', event)" class="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors" title="Editar"><span class="material-symbols-outlined text-[20px]">edit</span></button>
                        <button onclick="app.deleteLocker('${locker.id}', event)" class="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container/20 transition-colors" title="Excluir"><span class="material-symbols-outlined text-[20px]">delete</span></button>
                    </div>
                    <div class="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-surface-container-high text-primary flex items-center justify-center mb-4 md:mb-6 group-hover:bg-primary group-hover:text-white transition-all">
                        <span class="material-symbols-outlined text-2xl md:text-3xl">${locker.icon || 'door_back'}</span>
                    </div>
                    <h3 class="text-lg md:text-xl font-bold text-on-surface">${locker.name}</h3>
                    <p class="text-xs md:text-sm text-on-surface-variant mb-4 md:mb-6">${locker.desc || 'Sem descrição'}</p>
                    <div class="space-y-2 md:space-y-3 pt-3 md:pt-4 border-t border-outline-variant/50">
                        <div class="flex justify-between items-center text-[10px] md:text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                            <span>Ocupação</span><span class="text-primary">${capacity}%</span>
                        </div>
                        <div class="h-1.5 md:h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                            <div class="h-full bg-primary rounded-full transition-all" style="width: ${capacity}%"></div>
                        </div>
                    </div>
                </div>
            `);
        });

        grid.insertAdjacentHTML('beforeend', `
            <div onclick="app.openLockerForm(null, event)" class="border-2 border-dashed border-outline-variant rounded-xl p-5 md:p-6 flex flex-col items-center justify-center text-on-surface-variant hover:bg-surface-container-low hover:border-primary hover:text-primary transition-all cursor-pointer group min-h-[160px]">
                <span class="material-symbols-outlined text-3xl md:text-4xl mb-2 group-hover:scale-110 transition-transform">add_circle</span>
                <span class="font-bold text-sm md:text-base">Novo Armário</span>
            </div>
        `);
    },

    openLocker(id) {
        app.currentLockerId = id;
        const locker = app.allLockers.find(l => l.id === id);
        if(!locker) return;
        
        document.getElementById('modal-title').innerText = locker.name;
        document.getElementById('modal-subtitle').innerText = locker.zone;
        document.getElementById('locker-modal').classList.remove('hidden');
        app.renderNotebooks();
    },

    closeLocker() {
        document.getElementById('locker-modal').classList.add('hidden');
        app.currentLockerId = null;
    },

    openLockerForm(id, event) {
        if(event) event.stopPropagation(); 
        app.editingLockerId = id;
        
        if (id) {
            const locker = app.allLockers.find(l => l.id === id);
            document.getElementById('locker-form-title').innerText = "Editar Armário";
            document.getElementById('locker-form-name').value = locker.name;
            document.getElementById('locker-form-desc').value = locker.desc || "";
            document.getElementById('locker-form-floor').value = locker.zone;
        } else {
            document.getElementById('locker-form-title').innerText = "Novo Armário";
            document.getElementById('locker-form-name').value = "";
            document.getElementById('locker-form-desc').value = "";
            document.getElementById('locker-form-floor').value = "1º Andar";
        }
        document.getElementById('locker-form-modal').classList.remove('hidden');
    },

    closeLockerForm() {
        document.getElementById('locker-form-modal').classList.add('hidden');
    },

    async saveLockerForm() {
        const name = document.getElementById('locker-form-name').value;
        const desc = document.getElementById('locker-form-desc').value;
        const floor = document.getElementById('locker-form-floor').value;
        const zoneClass = floor === '1º Andar' ? '1-andar' : 'mezanino';

        if (!name) return app.showToast("Preencha o nome do armário.", "error");

        try {
            if (app.editingLockerId) {
                await updateDoc(doc(db, "armarios", app.editingLockerId), {
                    name: name, desc: desc, zone: floor, zoneClass: zoneClass
                });
                app.showToast("Armário atualizado!");
                app.addLog(`✏️ Atualizou o armário: ${name}`);
            } else {
                await addDoc(collection(db, "armarios"), { 
                    name: name, desc: desc || 'Sem descrição', zone: floor, zoneClass: zoneClass, icon: 'door_back', equipamentos: [] 
                });
                app.showToast("Armário criado!");
                app.addLog(`➕ Criou um novo armário: ${name}`);
            }
            app.closeLockerForm();
        } catch(e) { console.error(e); app.showToast("Erro ao salvar.", "error"); }
    },

    async deleteLocker(id, event) {
        event.stopPropagation();
        if(confirm("Tem certeza que deseja excluir este armário? Todos os itens dentro dele serão perdidos!")) {
            try {
                const l = app.allLockers.find(x => x.id === id);
                await deleteDoc(doc(db, "armarios", id));
                app.showToast("Armário excluído!");
                app.addLog(`🗑️ Excluiu o armário: ${l ? l.name : 'Desconhecido'}`);
            } catch(e) { console.error(e); app.showToast("Erro ao excluir", "error"); }
        }
    },

    renderNotebooks() {
        const list = document.getElementById('modal-item-list');
        const locker = app.allLockers.find(l => l.id === app.currentLockerId);
        if(!locker) return;

        const equips = locker.equipamentos || [];
        const capacity = Math.min(Math.round((equips.length / 15) * 100), 100);
        
        document.getElementById('modal-cap').innerText = capacity + '% da Cap.';
        document.getElementById('modal-progress').style.width = capacity + '%';

        list.innerHTML = `<div class="flex items-center justify-between mb-4"><h3 class="font-bold text-base md:text-lg text-on-surface">Itens no Armário (${equips.length}/15)</h3></div>`;

        equips.forEach((nb, index) => {
            let osBadge = '';
            if(nb.os) {
                let osIcon = 'desktop_windows';
                if(nb.os === 'Linux') osIcon = 'terminal';
                if(nb.os === 'MacOS') osIcon = 'laptop_mac';
                if(nb.os === 'Sem S.O.') osIcon = 'do_not_disturb';
                
                osBadge = `<span class="px-1.5 py-0.5 rounded bg-surface border border-outline-variant/30 text-[9px] font-bold text-on-surface-variant uppercase flex items-center gap-1 w-max mt-1"><span class="material-symbols-outlined text-[12px]">${osIcon}</span> ${nb.os}</span>`;
            }

            list.insertAdjacentHTML('beforeend', `
                <div class="bg-surface-container rounded-xl p-4 md:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 md:gap-4 border border-outline-variant/50 hover:border-primary/50 transition-all group">
                    <div class="flex items-center gap-4 w-full">
                        <div class="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-surface text-on-surface-variant flex items-center justify-center flex-shrink-0 border border-outline-variant/30">
                            <span class="material-symbols-outlined text-2xl md:text-3xl">laptop_mac</span>
                        </div>
                        <div class="flex-grow">
                            <div class="flex items-center gap-2 md:gap-3 mb-0.5 flex-wrap">
                                <h4 class="font-bold text-on-surface text-base md:text-lg">${nb.ic || nb.tag || 'S/IC'}</h4>
                                <span class="px-2 py-1 md:px-3 md:py-1 rounded-md ${nb.statusClass} text-[9px] md:text-[10px] font-black uppercase whitespace-nowrap border border-current opacity-80">${nb.statusText}</span>
                            </div>
                            <p class="text-[11px] text-on-surface-variant font-code-data mb-1.5 opacity-80">${nb.tag || 'S/TAG'} | ${nb.sn || 'S/SN'}</p>
                            <div class="flex items-center gap-2 mb-1">
                                <p class="text-sm font-bold text-on-surface-variant">${nb.model}</p>
                                ${osBadge}
                            </div>
                            <p class="text-xs text-outline">${nb.desc || 'Nenhuma observação'}</p>
                        </div>
                    </div>
                    <div class="flex gap-1 w-full sm:w-auto justify-end mt-2 sm:mt-0 pt-3 sm:pt-0 border-t border-outline-variant/30 sm:border-t-0">
                        <button onclick="app.openMoveModal(${index})" class="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors" title="Mover"><span class="material-symbols-outlined text-[20px]">move_up</span></button>
                        <button onclick="app.openNotebookForm(${index})" class="p-2 rounded-lg text-on-surface-variant hover:text-tertiary hover:bg-surface-container-high transition-colors" title="Editar"><span class="material-symbols-outlined text-[20px]">edit</span></button>
                        <button onclick="app.deleteNotebook(${index})" class="p-2 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container/20 transition-colors" title="Excluir"><span class="material-symbols-outlined text-[20px]">delete</span></button>
                    </div>
                </div>
            `);
        });

        list.insertAdjacentHTML('beforeend', `<button onclick="app.openNotebookForm(-1)" class="w-full py-3 md:py-4 mt-2 border-2 border-dashed border-outline-variant rounded-xl text-on-surface-variant font-bold hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2 text-sm md:text-base"><span class="material-symbols-outlined">add_circle</span> Adicionar Equipamento</button>`);
    },

    openNotebookForm(index) {
        app.editingNotebookIndex = index;
        const isEditing = index > -1;
        
        if(isEditing) {
            const locker = app.allLockers.find(l => l.id === app.currentLockerId);
            const nb = locker.equipamentos[index];
            document.getElementById('nb-ic').value = nb.ic || "";
            document.getElementById('nb-tag').value = nb.tag || "";
            document.getElementById('nb-sn').value = nb.sn || "";
            document.getElementById('nb-model').value = nb.model || "";
            document.getElementById('nb-desc').value = nb.desc || "";
            document.getElementById('nb-os').value = nb.os || "Windows";
            document.getElementById('nb-status').value = nb.statusText + "|" + nb.statusClass;
        } else {
            document.getElementById('nb-ic').value = "";
            document.getElementById('nb-tag').value = "";
            document.getElementById('nb-sn').value = "";
            document.getElementById('nb-model').value = "";
            document.getElementById('nb-desc').value = "";
            document.getElementById('nb-os').value = "Windows";
            document.getElementById('nb-status').value = "Disponível|bg-tertiary-container/20 text-tertiary";
        }
        document.getElementById('notebook-form-modal').classList.remove('hidden');
    },

    closeNotebookForm() {
        document.getElementById('notebook-form-modal').classList.add('hidden');
    },

    async saveNotebookForm() {
        const ic = document.getElementById('nb-ic').value;
        const tag = document.getElementById('nb-tag').value;
        const sn = document.getElementById('nb-sn').value;
        const model = document.getElementById('nb-model').value;
        const os = document.getElementById('nb-os').value;
        const desc = document.getElementById('nb-desc').value;
        const statusVal = document.getElementById('nb-status').value.split('|');

        if (!ic || !model) return app.showToast("Preencha IC/Ativo e Modelo.", "error");

        const locker = app.allLockers.find(l => l.id === app.currentLockerId);
        let equips = [...(locker.equipamentos || [])];

        const notebookData = {
            ic: ic, tag: tag, sn: sn, model: model, desc: desc,
            os: os,
            statusText: statusVal[0], statusClass: statusVal[1]
        };

        if (app.editingNotebookIndex > -1) {
            equips[app.editingNotebookIndex] = notebookData;
        } else {
            equips.push(notebookData);
        }

        try {
            await updateDoc(doc(db, "armarios", app.currentLockerId), { equipamentos: equips });
            app.showToast("Equipamento salvo!");
            app.closeNotebookForm();
        } catch(e) { console.error(e); app.showToast("Erro ao salvar equipamento", "error"); }
    },

    async deleteNotebook(index) {
        if(confirm("Tem certeza que deseja excluir este equipamento?")) {
            const locker = app.allLockers.find(l => l.id === app.currentLockerId);
            let equips = [...(locker.equipamentos || [])];
            equips.splice(index, 1);
            
            try {
                await updateDoc(doc(db, "armarios", app.currentLockerId), { equipamentos: equips });
                app.showToast("Equipamento excluído!");
            } catch(e) { console.error(e); app.showToast("Erro ao excluir", "error"); }
        }
    },

    openMoveModal(index) {
        app.movingNotebookIndex = index;
        const select = document.getElementById('move-dest-locker');
        select.innerHTML = '';
        
        let hasDestinations = false;
        app.allLockers.forEach(locker => {
            if(locker.id !== app.currentLockerId) {
                select.insertAdjacentHTML('beforeend', `<option value="${locker.id}">${locker.name} (${locker.zone})</option>`);
                hasDestinations = true;
            }
        });
        
        if(!hasDestinations) {
            app.showToast("Não há outros armários para transferir.", "error");
            return;
        }
        
        document.getElementById('move-modal').classList.remove('hidden');
    },

    closeMoveModal() {
        document.getElementById('move-modal').classList.add('hidden');
    },

    async confirmMove() {
        const destLockerId = document.getElementById('move-dest-locker').value;
        if(!destLockerId) return;
        
        const sourceLocker = app.allLockers.find(l => l.id === app.currentLockerId);
        const destLocker = app.allLockers.find(l => l.id === destLockerId);
        
        let sourceEquips = [...(sourceLocker.equipamentos || [])];
        let destEquips = [...(destLocker.equipamentos || [])];
        
        const notebookToMove = sourceEquips.splice(app.movingNotebookIndex, 1)[0];
        destEquips.push(notebookToMove);
        
        try {
            await updateDoc(doc(db, "armarios", app.currentLockerId), { equipamentos: sourceEquips });
            await updateDoc(doc(db, "armarios", destLockerId), { equipamentos: destEquips });
            
            app.showToast("Equipamento transferido com sucesso!");
            app.addLog(`🔄 Transferiu equipamento ${notebookToMove.tag} de ${sourceLocker.name} para ${destLocker.name}`);
            app.closeMoveModal();
        } catch(e) { console.error(e); app.showToast("Erro na transferência", "error"); }
    },

    /* =======================================
       LISTA DE TAREFAS / PLANNER
    ======================================= */
    listenToTasks() { 
        if (app.globalTasksUnsub) return;
        app.globalTasksUnsub = onSnapshot(collection(db, "tarefas"), snap => { 
            app.allTasks = snap.docs.map(d => ({id: d.id, ...d.data()})); 
            app.renderDashboard(); 
            if(document.getElementById('page-tarefas').classList.contains('active')) {
                app.renderTasksPage();
            }
        }); 
    },

    toggleFilter(menuId) {
        document.querySelectorAll('.filter-dropdown-menu').forEach(m => {
            if(m.id !== menuId) m.classList.add('hidden');
        });
        document.getElementById(menuId).classList.toggle('hidden');
    },

    updateTaskFilters() {
        const getChecked = (className) => Array.from(document.querySelectorAll(`.${className}:checked`)).map(cb => cb.value);
        
        const statusVals = getChecked('cb-status');
        const prioVals = getChecked('cb-priority');
        const assignVals = getChecked('cb-assignee');
        
        document.getElementById('label-status-menu').innerText = statusVals.length ? `${statusVals.length} selecionado(s)` : 'Todos';
        document.getElementById('label-priority-menu').innerText = prioVals.length ? `${prioVals.length} selecionado(s)` : 'Todas';
        document.getElementById('label-assignee-menu').innerText = assignVals.length ? `${assignVals.length} selecionado(s)` : 'Todos';

        this.taskFilterStatus = statusVals;
        this.taskFilterPriority = prioVals;
        this.taskFilterAssignee = assignVals;
        this.taskFilterDate = document.getElementById('task-filter-date').value;
        
        this.renderTasksPage();
    },

    clearTaskFilters() {
        document.querySelectorAll('.cb-status, .cb-priority, .cb-assignee').forEach(cb => cb.checked = false);
        document.getElementById('task-filter-date').value = '';
        
        document.getElementById('label-status-menu').innerText = 'Todos';
        document.getElementById('label-priority-menu').innerText = 'Todas';
        document.getElementById('label-assignee-menu').innerText = 'Todos';
        
        this.taskFilterStatus = [];
        this.taskFilterPriority = [];
        this.taskFilterAssignee = [];
        this.taskFilterDate = '';
        
        this.renderTasksPage();
    },

    renderTasksPage() {
        const listContainer = document.getElementById('task-list-container');
        const countBadge = document.getElementById('total-tasks-count');
        if(!listContainer) return;

        listContainer.innerHTML = '';
        const hoje = app.getTodayStr();

        let filteredTasks = app.allTasks;
        
        if(this.taskFilterStatus && this.taskFilterStatus.length > 0) {
            filteredTasks = filteredTasks.filter(t => {
                let s = (t.status || 'Em aberto').trim();
                if(s === 'Aberto') s = 'Em aberto';
                if(s === 'Em Progresso') s = 'Em andamento';
                if(s === 'Concluído' || s === 'Concluída' || s === 'Concluídas') s = 'Concluídas';
                if(s === 'Cancelado' || s === 'Cancelada' || s === 'Canceladas') s = 'Canceladas';
                return this.taskFilterStatus.includes(s);
            });
        }
        if(this.taskFilterPriority && this.taskFilterPriority.length > 0) {
            filteredTasks = filteredTasks.filter(t => this.taskFilterPriority.includes(t.priority));
        }
        if(this.taskFilterAssignee && this.taskFilterAssignee.length > 0) {
            filteredTasks = filteredTasks.filter(t => t.assignees && t.assignees.some(a => this.taskFilterAssignee.includes(a)));
        }
        if(this.taskFilterDate) {
            filteredTasks = filteredTasks.filter(t => {
                let d = typeof t.dueDate === 'string' ? t.dueDate : (t.dueDate ? t.dueDate.toDate().toISOString().split('T')[0] : '');
                return d === this.taskFilterDate;
            });
        }

        if(filteredTasks.length === 0) {
            listContainer.innerHTML = '<div class="p-8 text-center text-on-surface-variant italic">Nenhuma tarefa encontrada.</div>';
            if(countBadge) countBadge.innerText = "0";
            return;
        }

        filteredTasks.sort((a, b) => (b.ts_manual || 0) - (a.ts_manual || 0));

        let htmlStr = '';
        filteredTasks.forEach(t => {
            try {
                let taskDateStr = typeof t.dueDate === 'string' ? t.dueDate : (t.dueDate ? t.dueDate.toDate().toISOString().split('T')[0] : '');

                let normStatus = (t.status || 'Em aberto').trim();
                if(normStatus === 'Aberto') normStatus = 'Em aberto';
                if(normStatus === 'Em Progresso') normStatus = 'Em andamento';
                if(normStatus === 'Concluído' || normStatus === 'Concluída') normStatus = 'Concluídas';
                if(normStatus === 'Cancelado' || normStatus === 'Cancelada') normStatus = 'Canceladas';

                const isAtrasada = taskDateStr && taskDateStr < hoje && normStatus !== 'Concluídas' && normStatus !== 'Canceladas';
                let borderClass = isAtrasada ? 'border-red-500/50' : 'border-outline-variant/30';

                let priorityBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-surface-container-highest text-on-surface-variant">MÉDIA</span>';
                if(t.priority === 'Alta') priorityBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400">ALTA</span>';
                if(t.priority === 'Baixa') priorityBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400">BAIXA</span>';

                let statusColor = 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
                if (normStatus === 'Em andamento') statusColor = 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
                if (normStatus === 'Concluídas') statusColor = 'bg-green-500/20 text-green-400 border border-green-500/30';
                if (normStatus === 'Canceladas') statusColor = 'bg-red-500/20 text-red-400 border border-red-500/30';

                let assigneeHtml = '<div class="flex -space-x-2">';
                if (t.assignees && t.assignees.length > 0) {
                    t.assignees.forEach(uid => {
                        const u = app.getUserData(uid);
                        assigneeHtml += u.foto 
                            ? `<img src="${u.foto}" class="w-7 h-7 rounded-full border-2 border-surface bg-surface object-cover shadow-sm" title="${u.nome}">`
                            : `<div class="w-7 h-7 rounded-full bg-primary-container border-2 border-surface flex items-center justify-center text-[9px] font-bold shadow-sm" title="${u.nome}">${u.nome.substring(0,2).toUpperCase()}</div>`;
                    });
                } else {
                    assigneeHtml += `<div class="w-7 h-7 rounded-full bg-surface-variant border-2 border-surface flex items-center justify-center text-[10px] text-on-surface-variant shadow-sm" title="Sem Responsável">?</div>`;
                }
                assigneeHtml += '</div>';

                let moveBtns = '';
                if(normStatus === 'Em aberto') {
                    moveBtns = `<button onclick="event.stopPropagation(); app.changeTaskStatus('${t.id}', 'Em andamento')" class="p-1.5 rounded-lg border border-outline-variant flex items-center justify-center hover:bg-yellow-500/20 hover:text-yellow-400 hover:border-yellow-500 transition-colors bg-surface-container" title="Iniciar"><span class="material-symbols-outlined text-[18px]">play_arrow</span></button>`;
                } else if (normStatus === 'Em andamento') {
                    moveBtns = `
                        <button onclick="event.stopPropagation(); app.changeTaskStatus('${t.id}', 'Em aberto')" class="p-1.5 rounded-lg border border-outline-variant flex items-center justify-center hover:bg-blue-500/20 hover:text-blue-400 transition-colors bg-surface-container" title="Pausar"><span class="material-symbols-outlined text-[18px]">pause</span></button>
                        <button onclick="event.stopPropagation(); app.changeTaskStatus('${t.id}', 'Concluídas')" class="p-1.5 rounded-lg border border-outline-variant flex items-center justify-center hover:bg-green-500/20 hover:text-green-400 hover:border-green-500 transition-colors bg-surface-container" title="Concluir"><span class="material-symbols-outlined text-[18px]">check</span></button>
                    `;
                }

                let displayDate = taskDateStr ? (taskDateStr.includes('-') ? taskDateStr.split('-').reverse().join('/') : taskDateStr) : 'Sem prazo';

                htmlStr += `
                    <div class="glass-panel p-4 rounded-xl border ${borderClass} hover:border-primary/50 transition-colors group cursor-pointer shadow-sm flex flex-col md:flex-row gap-4 items-start md:items-center" onclick="app.openTaskDetails('${t.id}')">
                        <div class="flex flex-row md:flex-col gap-2 min-w-[130px]">
                            <span class="px-2 py-1 rounded text-[10px] font-black uppercase text-center tracking-wider ${statusColor}">${normStatus}</span>
                            <div class="hidden md:flex justify-center">${priorityBadge}</div>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-1">
                                <h4 class="font-bold text-base text-on-surface truncate">${t.title || 'Sem Título'}</h4>
                                <div class="md:hidden">${priorityBadge}</div>
                            </div>
                            <p class="text-sm text-on-surface-variant line-clamp-1 opacity-90">${t.desc || 'Sem detalhes informados.'}</p>
                        </div>
                        <div class="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto border-t md:border-t-0 border-outline-variant/30 pt-3 md:pt-0">
                            <div class="flex items-center gap-3">
                                ${assigneeHtml}
                                <div class="flex flex-col text-right">
                                    <span class="text-[10px] text-on-surface-variant uppercase font-bold">Prazo</span>
                                    <span class="text-xs font-code-data ${isAtrasada ? 'text-red-400 font-bold' : 'text-on-surface'}">${displayDate}</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-1 border-l border-outline-variant/30 pl-4 ml-2">
                                ${moveBtns}
                                <button onclick="event.stopPropagation(); app.openTaskForm('${t.id}')" class="p-1.5 rounded-lg border border-transparent text-on-surface-variant hover:text-primary hover:bg-primary-container/10 transition-all flex items-center justify-center ml-2" title="Editar"><span class="material-symbols-outlined text-[18px]">edit</span></button>
                                <button onclick="event.stopPropagation(); app.deleteTask('${t.id}')" class="p-1.5 rounded-lg border border-transparent text-on-surface-variant hover:text-red-400 hover:bg-red-500/20 transition-all flex items-center justify-center" title="Excluir"><span class="material-symbols-outlined text-[18px]">delete</span></button>
                            </div>
                        </div>
                    </div>
                `;
            } catch(e) { console.error("Erro render: ", e); }
        });

        listContainer.innerHTML = htmlStr;
        if(countBadge) countBadge.innerText = filteredTasks.length;
    },

    renderDashboard() {
        try {
            const c = document.getElementById('my-tasks-list'); if(!c) return; c.innerHTML = '';
            const hoje = app.getTodayStr();
            const currentUid = auth.currentUser ? auth.currentUser.uid : null;

            let myTasks = app.allTasks.filter(t => { 
                const matchAssignee = t.assignees && t.assignees.includes(currentUid);
                let normStatus = (t.status || 'Em aberto').trim();
                if(normStatus === 'Concluído' || normStatus === 'Concluída') normStatus = 'Concluídas';
                if(normStatus === 'Cancelado' || normStatus === 'Cancelada') normStatus = 'Canceladas';
                const notDone = normStatus !== 'Concluídas' && normStatus !== 'Canceladas';
                return matchAssignee && notDone; 
            });

            let combinedList = [];
            myTasks.forEach(t => {
                let taskDateStr = typeof t.dueDate === 'string' ? t.dueDate : (t.dueDate ? t.dueDate.toDate().toISOString().split('T')[0] : '');
                const isAtrasada = taskDateStr && taskDateStr < hoje;
                combinedList.push({ isTask: true, data: t, dateStr: taskDateStr, isAtrasada: isAtrasada });
            });

            let myOverdueNotes = app.allReminders.filter(r => {
                let assigns = r.assignees || (r.author ? [r.author] : []);
                return r.type === 'Nota' && r.status !== 'Concluído' && assigns.includes(currentUid) && r.date;
            });
            myOverdueNotes.forEach(r => {
                const rDateTime = new Date(`${r.date}T${r.time || '23:59'}`);
                if (rDateTime < new Date()) {
                    combinedList.push({ isTask: false, data: r, dateStr: r.date, isAtrasada: true });
                }
            });

            combinedList.sort((a, b) => {
                if (a.isAtrasada && !b.isAtrasada) return -1;
                if (!a.isAtrasada && b.isAtrasada) return 1;
                return (b.data.ts_manual || 0) - (a.data.ts_manual || 0);
            });

            if(combinedList.length === 0) {
                c.innerHTML = '<p class="p-4 text-center text-xs text-on-surface-variant/50 font-medium">Nenhuma pendência na sua fila hoje.</p>';
                return;
            }
            
            let htmlStr = '';
            combinedList.forEach(item => {
                try {
                    const d = item.data;
                    const isAtrasada = item.isAtrasada;
                    
                    let pTag = '';
                    if (!item.isTask) {
                        pTag = `<span class="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 font-label-caps text-[9px] rounded border border-yellow-500/20 animate-pulse flex items-center gap-1"><span class="material-symbols-outlined text-[10px]">sticky_note_2</span> NOTA ATRASADA</span>`;
                    } else {
                        if(isAtrasada) {
                            pTag = `<span class="px-1.5 py-0.5 bg-red-500/20 text-red-400 font-label-caps text-[9px] rounded border border-red-500/20 animate-pulse">ATRASADA</span>`;
                        } else if(d.priority === 'Alta') {
                            pTag = `<span class="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 font-label-caps text-[9px] rounded border border-orange-500/20">ALTA</span>`;
                        } else if(d.priority === 'Baixa') {
                            pTag = `<span class="px-1.5 py-0.5 bg-green-500/20 text-green-400 font-label-caps text-[9px] rounded border border-green-500/20">BAIXA</span>`;
                        }
                    }
                    
                    let displayDate = item.dateStr ? (item.dateStr.includes('-') ? item.dateStr.split('-').reverse().join('/') : item.dateStr) : '';
                    let navClick = item.isTask 
                        ? `app.navigate('tarefas'); setTimeout(() => { app.openTaskDetails('${d.id}'); }, 150);` 
                        : `app.navigate('lembretes'); setTimeout(() => { app.openReminderForm('${d.id}'); }, 150);`;
                    let borderClass = isAtrasada ? (item.isTask ? 'border-red-500/50 shadow-[0_0_8px_rgba(239,68,68,0.2)]' : 'border-yellow-500/50 shadow-[0_0_8px_rgba(234,179,8,0.2)]') : 'border-outline-variant/30';
                    let textClass = isAtrasada ? (item.isTask ? 'text-red-400' : 'text-yellow-400') + ' font-bold' : 'text-on-surface-variant';

                    htmlStr += `
                        <li>
                            <label class="flex items-start gap-3 p-3 rounded-lg bg-surface hover:bg-surface-variant border ${borderClass} cursor-pointer transition-colors group/task" onclick="${navClick}">
                                <div class="flex-1">
                                    <div class="flex items-center gap-2">
                                        <span class="font-body-sm text-body-sm text-on-surface group-hover/task:text-primary transition-colors">${d.title || 'Sem Título'}</span>
                                        ${pTag}
                                    </div>
                                    ${displayDate ? `<span class="font-code-data text-[10px] ${textClass} block mt-1">Prazo: ${displayDate} ${d.time ? 'às '+d.time : ''}</span>` : ''}
                                </div>
                            </label>
                        </li>
                    `;
                } catch(e) { console.error("Erro painel dash:", e); }
            });
            c.innerHTML = htmlStr;
        } catch (e) { console.error("Erro na renderização dashboard", e); }
    },

    openTaskForm(id = null) {
        if (id) {
            const t = app.allTasks.find(x => x.id === id);
            if(!t) return;
            document.getElementById('task-form-title').innerText = "Editar Tarefa";
            document.getElementById('task-id').value = t.id;
            document.getElementById('task-title').value = t.title || "";
            document.getElementById('task-desc').value = t.desc || "";
            document.getElementById('task-date').value = t.dueDate || "";
            document.getElementById('task-priority').value = t.priority || "Média";
            
            let normStatus = (t.status || 'Em aberto').trim();
            if(normStatus === 'Aberto') normStatus = 'Em aberto';
            if(normStatus === 'Em Progresso') normStatus = 'Em andamento';
            if(normStatus === 'Concluído' || normStatus === 'Concluída' || normStatus === 'Concluídas') normStatus = 'Concluídas';
            if(normStatus === 'Cancelado' || normStatus === 'Cancelada' || normStatus === 'Canceladas') normStatus = 'Canceladas';
            
            document.getElementById('task-status').value = normStatus;
            
            document.querySelectorAll('input[name="assignees"]').forEach(cb => {
                cb.checked = t.assignees && t.assignees.includes(cb.value);
            });
        } else {
            document.getElementById('task-form-title').innerText = "Nova Tarefa";
            document.getElementById('task-id').value = "";
            document.getElementById('task-title').value = "";
            document.getElementById('task-desc').value = "";
            document.getElementById('task-date').value = app.getTodayStr();
            document.getElementById('task-priority').value = "Média";
            document.getElementById('task-status').value = "Em aberto";
            
            document.querySelectorAll('input[name="assignees"]').forEach(cb => cb.checked = false);
        }
        document.getElementById('task-form-modal').classList.remove('hidden');
    },

    closeTaskForm() {
        document.getElementById('task-form-modal').classList.add('hidden');
    },

    async saveTaskForm() {
        const id = document.getElementById('task-id').value;
        const title = document.getElementById('task-title').value;
        const desc = document.getElementById('task-desc').value;
        const dueDate = document.getElementById('task-date').value;
        const priority = document.getElementById('task-priority').value;
        const status = document.getElementById('task-status').value;
        
        const assignees = Array.from(document.querySelectorAll('input[name="assignees"]:checked')).map(cb => cb.value);

        if(!title) return app.showToast("O título é obrigatório.", "error");

        const taskData = {
            title, desc, dueDate, priority, status,
            assignees: assignees,
            ts_manual: Date.now()
        };

        try {
            if(id) {
                await updateDoc(doc(db, "tarefas", id), taskData);
                app.showToast("Tarefa atualizada!");
            } else {
                await addDoc(collection(db, "tarefas"), taskData);
                app.showToast("Tarefa criada!");
                app.addLog(`➕ Criou a tarefa: ${title}`, 'Logística');
            }
            app.closeTaskForm();
            app.renderTasksPage(); 
        } catch(e) { console.error(e); app.showToast("Erro ao salvar.", "error"); }
    },

    async deleteTask(id) {
        if(confirm("Tem certeza que deseja excluir esta tarefa?")) {
            try {
                await deleteDoc(doc(db, "tarefas", id));
                app.showToast("Tarefa excluída.");
            } catch(e) { console.error(e); app.showToast("Erro ao excluir", "error"); }
        }
    },

    async changeTaskStatus(id, newStatus) {
        try {
            await updateDoc(doc(db, "tarefas", id), { status: newStatus });
            app.showToast(`Movido para ${newStatus}`);
            
            const t = app.allTasks.find(x => x.id === id);
            if(newStatus === 'Concluídas' && t) {
                app.addLog(`✅ Concluiu a tarefa: ${t.title}`, 'Logística');
            }
        } catch(e) { console.error(e); app.showToast("Erro", "error"); }
    },

    openTaskDetails(id) {
        const t = app.allTasks.find(x => x.id === id);
        if(!t) return;
        app.currentTaskId = id;
        
        let normStatus = (t.status || 'Em aberto').trim();
        if(normStatus === 'Aberto') normStatus = 'Em aberto';
        if(normStatus === 'Em Progresso') normStatus = 'Em andamento';
        if(normStatus === 'Concluído' || normStatus === 'Concluída' || normStatus === 'Concluídas') normStatus = 'Concluídas';
        if(normStatus === 'Cancelado' || normStatus === 'Cancelada' || normStatus === 'Canceladas') normStatus = 'Canceladas';
        
        let statusColor = 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
        if (normStatus === 'Em andamento') statusColor = 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
        if (normStatus === 'Concluídas') statusColor = 'bg-green-500/20 text-green-400 border border-green-500/30';
        if (normStatus === 'Canceladas') statusColor = 'bg-red-500/20 text-red-400 border border-red-500/30';

        document.getElementById('det-status').className = `px-2 py-1 rounded text-[10px] font-black uppercase text-center tracking-wider ${statusColor}`;
        document.getElementById('det-status').innerText = normStatus;
        document.getElementById('det-title').innerText = t.title || 'Sem Título';
        document.getElementById('det-desc').innerText = t.desc || 'Sem descrição.';
        
        const dateStr = typeof t.dueDate === 'string' ? t.dueDate : (t.dueDate ? t.dueDate.toDate().toISOString().split('T')[0] : '');
        document.getElementById('det-date').innerText = dateStr ? dateStr.split('-').reverse().join('/') : 'Sem prazo definido';
        
        let pBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-surface-container text-on-surface">MÉDIA</span>';
        if(t.priority === 'Alta') pBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400">ALTA</span>';
        if(t.priority === 'Baixa') pBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400">BAIXA</span>';
        document.getElementById('det-priority-container').innerHTML = pBadge;

        document.getElementById('task-details-modal').classList.remove('hidden');
        app.listenToTaskComments(id);
        app.listenToSubtasks(id);
    },

    closeTaskDetails() {
        if(app.commentsUnsub) { app.commentsUnsub(); app.commentsUnsub = null; }
        if(app.subtasksUnsub) { app.subtasksUnsub(); app.subtasksUnsub = null; }
        app.currentTaskId = null;
        document.getElementById('task-details-modal').classList.add('hidden');
    },

    listenToTaskComments(taskId) {
        if(app.commentsUnsub) app.commentsUnsub();
        const list = document.getElementById('task-comments-list');
        list.innerHTML = '<div class="text-center text-xs text-on-surface-variant/50 mt-4">Carregando histórico...</div>';

        app.commentsUnsub = onSnapshot(collection(db, "tarefas", taskId, "comentarios"), snap => {
            const comments = snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (a.ts || 0) - (b.ts || 0));
            list.innerHTML = '';
            
            if(comments.length === 0) {
                list.innerHTML = '<div class="text-center text-xs text-on-surface-variant/50 mt-4 italic">Nenhum comentário ainda. Seja o primeiro a atualizar!</div>';
                return;
            }

            comments.forEach(c => {
                const isMe = c.author === (auth.currentUser.displayName || auth.currentUser.email);
                const time = new Date(c.ts).toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'});
                const date = new Date(c.ts).toLocaleDateString('pt-BR');
                
                if(isMe) {
                    list.innerHTML += `
                        <div class="flex justify-end mb-2">
                            <div class="bg-primary-container text-on-primary-container rounded-2xl rounded-tr-sm px-4 py-2 max-w-[85%] shadow-sm">
                                <p class="text-[13px] whitespace-pre-wrap">${c.text}</p>
                                <span class="text-[9px] opacity-70 block text-right mt-1 font-code-data">${date} ${time}</span>
                            </div>
                        </div>
                    `;
                } else {
                    list.innerHTML += `
                        <div class="flex items-start gap-2 mb-2">
                            <div class="w-6 h-6 rounded-full bg-surface-variant flex items-center justify-center shrink-0 border border-outline-variant/30 text-[10px] font-bold text-on-surface">
                                ${c.author.substring(0,2).toUpperCase()}
                            </div>
                            <div class="bg-surface-container rounded-2xl rounded-tl-sm px-4 py-2 max-w-[85%] border border-outline-variant/30 shadow-sm">
                                <p class="text-[13px] text-on-surface whitespace-pre-wrap">${c.text}</p>
                                <span class="text-[9px] text-on-surface-variant block mt-1 font-code-data">${c.author} • ${date} ${time}</span>
                            </div>
                        </div>
                    `;
                }
            });
            setTimeout(() => { list.scrollTop = list.scrollHeight; }, 100);
        });
    },

    async addTaskComment() {
        const inp = document.getElementById('task-comment-inp');
        const text = inp.value.trim();
        if(!text || !app.currentTaskId) return;

        try {
            inp.value = '';
            await addDoc(collection(db, "tarefas", app.currentTaskId, "comentarios"), {
                text: text,
                author: auth.currentUser.displayName || auth.currentUser.email,
                ts: Date.now()
            });
        } catch(e) { console.error(e); app.showToast("Erro ao enviar mensagem", "error"); }
    },

    listenToSubtasks(taskId) {
        if(app.subtasksUnsub) app.subtasksUnsub();
        const list = document.getElementById('subtasks-list');
        list.innerHTML = '<div class="text-xs text-on-surface-variant/50">Carregando subtarefas...</div>';

        app.subtasksUnsub = onSnapshot(collection(db, "tarefas", taskId, "subtarefas"), snap => {
            app.allSubtasks = snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (a.ts || 0) - (b.ts || 0));
            list.innerHTML = '';
            
            if(app.allSubtasks.length === 0) {
                list.innerHTML = '<div class="text-xs text-on-surface-variant/50 italic py-2">Nenhum item adicionado.</div>';
                return;
            }
            
            app.allSubtasks.forEach(sub => {
                const checked = sub.isDone ? 'checked' : '';
                const lineClass = sub.isDone ? 'line-through opacity-50 text-on-surface-variant' : 'text-on-surface';
                const bgClass = sub.isDone ? 'bg-surface-container-highest border-transparent' : 'bg-[#232323] border-outline-variant/50 hover:border-primary/50';
                
                list.innerHTML += `
                    <div class="flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer group ${bgClass}" onclick="app.openSubtaskDetails('${sub.id}')">
                        <div class="flex items-center gap-3">
                            <input type="checkbox" ${checked} onclick="event.stopPropagation(); app.toggleSubtask('${taskId}', '${sub.id}', this.checked)" class="w-5 h-5 rounded bg-surface border-outline-variant text-primary focus:ring-primary pointer-events-auto">
                            <span class="text-sm font-medium ${lineClass}">${sub.title}</span>
                        </div>
                        <span class="material-symbols-outlined text-[18px] text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity">open_in_new</span>
                    </div>
                `;
            });
        });
    },

    async addSubtask() {
        const inp = document.getElementById('new-subtask-inp');
        const title = inp.value.trim();
        if(!title || !app.currentTaskId) return;
        try {
            inp.value = '';
            await addDoc(collection(db, "tarefas", app.currentTaskId, "subtarefas"), {
                title: title, isDone: false, ts: Date.now()
            });
        } catch(e) { console.error(e); app.showToast("Erro ao adicionar item", "error"); }
    },

    async toggleSubtask(taskId, subId, isDone) {
        try {
            await updateDoc(doc(db, "tarefas", taskId, "subtarefas", subId), { isDone: isDone });
            if(isDone) app.addLog(`✅ Concluiu a etapa da tarefa`, 'Logística');
        } catch(e) { console.error(e); }
    },

    openSubtaskDetails(subId) {
        app.currentSubtaskId = subId;
        const sub = app.allSubtasks.find(s => s.id === subId);
        if(!sub) return;

        document.getElementById('subdet-title').innerText = sub.title;
        document.getElementById('subdet-checkbox').checked = sub.isDone;
        document.getElementById('subtask-details-modal').classList.remove('hidden');

        app.listenToSubtaskComments(app.currentTaskId, subId);
    },

    closeSubtaskDetails() {
        if(app.subcommentsUnsub) { app.subcommentsUnsub(); app.subcommentsUnsub = null; }
        app.currentSubtaskId = null;
        document.getElementById('subtask-details-modal').classList.add('hidden');
    },

    editSubtask() {
        if(!app.currentTaskId || !app.currentSubtaskId) return;
        const sub = app.allSubtasks.find(s => s.id === app.currentSubtaskId);
        if(!sub) return;
        const novoTitulo = prompt("Editar nome da subtarefa:", sub.title);
        if(novoTitulo && novoTitulo.trim() !== "") {
            updateDoc(doc(db, "tarefas", app.currentTaskId, "subtarefas", app.currentSubtaskId), { title: novoTitulo.trim() })
                .then(() => {
                    document.getElementById('subdet-title').innerText = novoTitulo.trim();
                    app.showToast("Subtarefa atualizada!");
                })
                .catch(e => console.error(e));
        }
    },

    async toggleCurrentSubtask(isDone) {
        if(!app.currentTaskId || !app.currentSubtaskId) return;
        await app.toggleSubtask(app.currentTaskId, app.currentSubtaskId, isDone);
    },

    async deleteSubtask() {
        if(!confirm("Excluir definitivamente este item?")) return;
        try {
            await deleteDoc(doc(db, "tarefas", app.currentTaskId, "subtarefas", app.currentSubtaskId));
            app.closeSubtaskDetails();
            app.showToast("Item excluído");
        } catch(e) { console.error(e); }
    },

    listenToSubtaskComments(taskId, subId) {
        if(app.subcommentsUnsub) app.subcommentsUnsub();
        const list = document.getElementById('subtask-comments-list');
        list.innerHTML = '<div class="text-center text-xs text-on-surface-variant/50 mt-4">Carregando...</div>';

        app.subcommentsUnsub = onSnapshot(collection(db, "tarefas", taskId, "subtarefas", subId, "comentarios"), snap => {
            const comments = snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (a.ts || 0) - (b.ts || 0));
            list.innerHTML = '';
            if(comments.length === 0) {
                list.innerHTML = '<div class="text-center text-xs text-on-surface-variant/50 mt-4 italic">Nenhum comentário nesta etapa.</div>'; return;
            }
            comments.forEach(c => {
                const isMe = c.author === (auth.currentUser.displayName || auth.currentUser.email);
                const time = new Date(c.ts).toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'});
                const date = new Date(c.ts).toLocaleDateString('pt-BR');
                
                if(isMe) {
                    list.innerHTML += `
                        <div class="flex justify-end mb-2">
                            <div class="bg-tertiary-container text-on-tertiary-container rounded-2xl rounded-tr-sm px-4 py-2 max-w-[85%] shadow-sm">
                                <p class="text-[13px] whitespace-pre-wrap">${c.text}</p>
                                <span class="text-[9px] opacity-70 block text-right mt-1 font-code-data">${date} ${time}</span>
                            </div>
                        </div>`;
                } else {
                    list.innerHTML += `
                        <div class="flex items-start gap-2 mb-2">
                            <div class="w-6 h-6 rounded-full bg-surface-variant flex items-center justify-center shrink-0 border border-outline-variant/30 text-[10px] font-bold text-on-surface">${c.author.substring(0,2).toUpperCase()}</div>
                            <div class="bg-surface-container rounded-2xl rounded-tl-sm px-4 py-2 max-w-[85%] border border-outline-variant/30 shadow-sm">
                                <p class="text-[13px] text-on-surface whitespace-pre-wrap">${c.text}</p>
                                <span class="text-[9px] text-on-surface-variant block mt-1 font-code-data">${c.author} • ${date} ${time}</span>
                            </div>
                        </div>`;
                }
            });
            setTimeout(() => { list.scrollTop = list.scrollHeight; }, 100);
        });
    },

    async addSubtaskComment() {
        const inp = document.getElementById('subtask-comment-inp');
        const text = inp.value.trim();
        if(!text || !app.currentTaskId || !app.currentSubtaskId) return;
        try {
            inp.value = '';
            await addDoc(collection(db, "tarefas", app.currentTaskId, "subtarefas", app.currentSubtaskId, "comentarios"), {
                text: text, author: auth.currentUser.displayName || auth.currentUser.email, ts: Date.now()
            });
        } catch(e) { console.error(e); }
    },

    loadUsers() { 
        if (app.globalUsersUnsub) return;
        app.globalUsersUnsub = onSnapshot(collection(db, "usuarios"), (snap) => { 
            app.userMap = {};
            snap.docs.forEach(d => { app.userMap[d.id] = { uid: d.id, ...d.data() }; });
            
            const opSelect = document.getElementById('log-operator-filter');
            if(opSelect) {
                const currentOp = opSelect.value;
                opSelect.innerHTML = '<option value="Todos">Todos Operadores</option>' +
                    Object.values(app.userMap).map(u => `<option value="${u.nome}">${u.nome}</option>`).join('');
                opSelect.value = currentOp;
            }
            
            const assignList = document.getElementById('task-assignee-list');
            if(assignList) {
                assignList.innerHTML = Object.values(app.userMap).map(u => `
                    <label class="flex items-center gap-2 cursor-pointer hover:text-primary p-1">
                        <input type="checkbox" name="assignees" value="${u.uid}" class="rounded bg-surface border-outline-variant text-primary">
                        <span class="text-sm">${u.nome}</span>
                    </label>
                `).join('');
            }
            
            const assignFilterSelect = document.getElementById('assignee-menu');
            if(assignFilterSelect) {
                assignFilterSelect.innerHTML = Object.values(app.userMap).map(u => `
                    <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-surface cursor-pointer">
                        <input type="checkbox" value="${u.uid}" class="cb-assignee rounded bg-surface border-outline-variant text-primary" onchange="app.updateTaskFilters()">
                        <span class="text-sm text-on-surface truncate">${u.nome}</span>
                    </label>
                `).join('');
            }

            const remOpSelect = document.getElementById('rem-filter-operator');
            if(remOpSelect) {
                const currentRemOp = remOpSelect.value;
                remOpSelect.innerHTML = '<option value="Todos">Todos</option>' +
                    Object.values(app.userMap).map(u => `<option value="${u.uid}">${u.nome}</option>`).join('');
                remOpSelect.value = currentRemOp || 'Todos';
            }
            
            const remAssignList = document.getElementById('rem-assignee-list');
            if(remAssignList) {
                remAssignList.innerHTML = Object.values(app.userMap).map(u => `
                    <label class="flex items-center gap-2 cursor-pointer hover:text-primary p-1">
                        <input type="checkbox" name="rem-assignees" value="${u.uid}" class="rounded bg-surface border-outline-variant text-primary">
                        <span class="text-sm">${u.nome}</span>
                    </label>
                `).join('');
            }

            const confList = document.getElementById('conf-users-list');
            if(confList) {
                confList.innerHTML = Object.values(app.userMap).map(u => {
                    const foto = u.foto ? `<img src="${u.foto}" class="w-10 h-10 rounded-full object-cover">` : `<div class="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center font-bold text-xs">${u.nome.substring(0,2).toUpperCase()}</div>`;
                    return `
                    <div class="flex items-center gap-3 p-3 bg-surface border border-outline-variant/30 rounded-lg">
                        ${foto}
                        <div class="flex flex-col">
                            <span class="font-bold text-sm text-on-surface">${u.nome}</span>
                            <span class="text-[10px] text-on-surface-variant uppercase tracking-wider">${u.cargo || 'Membro da Equipe'}</span>
                        </div>
                    </div>`;
                }).join('');
            }

            const chatList = document.getElementById('chat-user-list-view');
            if(chatList) {
                const currentUid = auth.currentUser ? auth.currentUser.uid : null;
                const others = Object.values(app.userMap).filter(u => u.uid !== currentUid);
                chatList.innerHTML = others.map(u => {
                    const foto = u.foto ? `<img src="${u.foto}" class="w-8 h-8 rounded-full object-cover">` : `<div class="w-8 h-8 rounded-full bg-surface-variant flex items-center justify-center font-bold text-[10px]">${u.nome.substring(0,2).toUpperCase()}</div>`;
                    return `
                    <div class="flex items-center gap-3 p-2 hover:bg-surface-variant/50 rounded-lg cursor-pointer transition-colors" onclick="app.openChatWith('${u.uid}')">
                        ${foto}
                        <div class="flex flex-col">
                            <span class="font-bold text-sm text-on-surface">${u.nome}</span>
                        </div>
                    </div>`;
                }).join('');
            }

            app.renderDashboard();
        }); 
    },
    
    signOut() { 
        const em = document.getElementById('login-email'); 
        const ps = document.getElementById('login-password'); 
        if(em) em.value = ''; 
        if(ps) ps.value = ''; 
        if (app.globalTasksUnsub) { app.globalTasksUnsub(); app.globalTasksUnsub = null; }
        if (app.globalNotifsUnsub) { app.globalNotifsUnsub(); app.globalNotifsUnsub = null; }
        if (app.globalUsersUnsub) { app.globalUsersUnsub(); app.globalUsersUnsub = null; }
        if (app.lockersUnsub) { app.lockersUnsub(); app.lockersUnsub = null; }
        if (app.remindersUnsub) { app.remindersUnsub(); app.remindersUnsub = null; }
        if (app.chatUnsub) { app.chatUnsub(); app.chatUnsub = null; }
        if (app.estoquePollInterval) { clearInterval(app.estoquePollInterval); app.estoquePollInterval = null; }
        if (app.alertCheckInterval) { clearInterval(app.alertCheckInterval); app.alertCheckInterval = null; }
        app.stopAlarmEngine();
        signOut(auth); 
    },

    showToast(m, t='success') { 
        const c = document.getElementById('toast-container'); 
        const toast = document.createElement('div'); 
        toast.className = `toast ${t} shadow-xl border dark:border-white/5`; 
        toast.innerHTML = `<span class="material-symbols-outlined">${t==='success'?'check_circle':'error'}</span> <span class="font-bold text-sm">${m}</span>`; 
        c.appendChild(toast); 
        setTimeout(() => { 
            toast.style.animation = 'fadeOut 0.3s forwards'; 
            setTimeout(() => toast.remove(), 300); 
        }, 3000); 
    }
};

window.app = app;
app.init();
