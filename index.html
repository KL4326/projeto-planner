<!DOCTYPE html>
<html lang="pt-br" class="h-full">
<head>
    <meta charset="utf-8"/>
    <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
    <title>Logística - Tarefas</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📋</text></svg>">
    <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
    <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
    <link rel="stylesheet" href="style.css">
    <script id="tailwind-config">
        tailwind.config = { darkMode: "class", theme: { extend: { colors: { "primary": "#2463eb", "background-light": "#f6f6f8", "background-dark": "#111621" }, fontFamily: { "display": ["Manrope", "sans-serif"] } } } }
    </script>
    <style>
        .page-section { display: none; }
        .page-section.active { display: block !important; }
        
        #page-login.active { 
            display: flex !important; 
            flex-direction: column;
            align-items: center; 
            justify-content: center; 
            position: fixed;
            inset: 0;
            width: 100%;
            height: 100%;
            z-index: 9999;
            background-color: #f6f6f8;
        }
        .dark #page-login.active { background-color: #111621; }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .filter-btn.active { background-color: #2463eb !important; color: white !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #334155; border-radius: 20px; }
        .drag-handle { cursor: grab; padding: 4px; opacity: 0.5; }
        .subtask-done { text-decoration: line-through; opacity: 0.4; font-style: italic; }
        
        /* Fix cores modo escuro */
        .dark select, .dark input, .dark textarea { background-color: #1e293b !important; color: white !important; border-color: #334155 !important; }
        select option { background-color: white; color: black; }
        .dark select option { background-color: #1e293b; color: white; }
    </style>
</head>
<body class="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 min-h-full transition-colors duration-300">
    
    <header id="main-header" class="hidden flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-background-dark px-6 py-3 lg:px-20 sticky top-0 z-50 gap-4">
        <div class="flex items-center gap-2 text-primary shrink-0 cursor-pointer" onclick="app.navigate('dashboard')">
            <span class="material-symbols-outlined text-3xl font-bold">layers</span>
            <h2 class="text-slate-900 dark:text-white text-xl font-black hidden sm:block tracking-tighter">Planner - T.I</h2>
        </div>

        <div class="flex-1 max-w-md mx-4 flex items-center gap-4">
            <div class="relative group flex-1">
                <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input id="search-input" type="text" placeholder="Procurar no planner..." class="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none transition-all dark:text-white">
            </div>
            
            <div class="relative">
                <button id="notif-btn" class="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all relative">
                    <span class="material-symbols-outlined text-slate-500 dark:text-slate-400">notifications</span>
                    <span id="notif-badge" class="hidden absolute -top-1 -right-1 size-5 bg-red-600 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white dark:border-background-dark">0</span>
                </button>
                <div id="notif-menu" class="hidden absolute right-0 mt-3 w-80 bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden text-left">
                    <div class="p-4 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                        <span class="text-xs font-black uppercase tracking-widest">Notificações</span>
                    </div>
                    <div id="notif-list" class="max-h-96 overflow-y-auto custom-scrollbar divide-y dark:divide-slate-800"></div>
                </div>
            </div>
        </div>

        <div id="profile-btn" class="flex items-center gap-2 cursor-pointer p-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-all relative">
            <div id="header-avatar" class="size-9 rounded-full border-2 border-primary/20 bg-primary text-white flex items-center justify-center font-bold bg-cover bg-center text-xs">...</div>
            <div id="profile-menu" class="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-xl shadow-xl hidden overflow-hidden z-50 text-left">
                <button class="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2" onclick="app.navigate('perfil')"><span class="material-symbols-outlined text-lg">person</span> Perfil</button>
                <button class="theme-toggle w-full text-left px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"><span class="material-symbols-outlined text-lg">dark_mode</span> Tema</button>
                <button class="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2" onclick="signOut(auth)"><span class="material-symbols-outlined text-lg">logout</span> Sair</button>
            </div>
        </div>
    </header>

    <main id="main-content">
        <section id="page-login" class="page-section active">
            <div class="w-full max-w-md bg-white dark:bg-slate-900 p-10 rounded-3xl shadow-2xl border dark:border-slate-800 text-center">
                <span class="material-symbols-outlined text-6xl text-primary font-bold mb-4">layers</span>
                <h2 class="text-2xl font-black mb-8 dark:text-white uppercase tracking-tighter">Acessar o planner</h2>
                <form id="login-form" class="flex flex-col gap-4 text-left">
                    <input id="login-email" type="email" placeholder="E-mail" class="rounded-xl border-slate-200 p-4 dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-primary" required>
                    <input id="login-password" type="password" placeholder="Senha" class="rounded-xl border-slate-200 p-4 dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-primary" required>
                    <button type="submit" class="bg-primary text-white font-black py-4 rounded-2xl hover:bg-primary/90 shadow-lg uppercase text-sm tracking-widest">Entrar</button>
                </form>
            </div>
        </section>

        <section id="page-dashboard" class="page-section px-6 lg:px-20 py-8">
            <div class="flex flex-col lg:flex-row gap-8 text-left">
                <div class="flex-1 flex flex-col gap-6">
                    <div class="flex flex-wrap justify-between items-center gap-4">
                        <div><h1 class="text-3xl font-black">Minhas Tarefas</h1><p class="text-slate-500 text-sm italic">Gestão e equipa</p></div>
                        <button onclick="app.navigate('nova-tarefa')" class="bg-primary text-white px-8 py-3 rounded-xl font-black shadow-lg">Nova Tarefa</button>
                    </div>
                    <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border dark:border-slate-800 shadow-sm">
                        <div class="flex flex-wrap gap-2 pb-4 border-b dark:border-slate-800">
                            <button data-filter="Todas" class="filter-btn active rounded-lg bg-slate-100 dark:bg-slate-800 px-4 py-2 text-[10px] font-black uppercase transition-all">Todas</button>
                            <button data-filter="Em aberto" class="filter-btn rounded-lg bg-slate-100 dark:bg-slate-800 px-4 py-2 text-[10px] font-black uppercase transition-all">Em aberto</button>
                            <button data-filter="Concluída" class="filter-btn rounded-lg bg-slate-100 dark:bg-slate-800 px-4 py-2 text-[10px] font-black uppercase transition-all text-green-500">Concluídas</button>
                        </div>
                        <div id="tasks-container" class="grid grid-cols-1 gap-2 mt-4 min-h-[50px]"></div>
                    </div>
                </div>
                <div class="w-80 hidden lg:block">
                    <div class="bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 shadow-sm overflow-hidden">
                        <div class="bg-slate-50 dark:bg-slate-800/50 p-4 border-b dark:border-slate-800 font-black text-xs text-primary uppercase text-left">🏆 Ranking</div>
                        <div id="ranking-container" class="p-4 flex flex-col gap-2"></div>
                    </div>
                </div>
            </div>
        </section>

        <section id="page-nova-tarefa" class="page-section px-6 lg:px-40 py-8">
            <div class="flex items-center justify-between mb-8 text-left"><h2 class="text-3xl font-black">Criar Projeto</h2><button onclick="app.navigate('dashboard')" class="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl">Voltar</button></div>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 text-left">
                <div class="lg:col-span-2 flex flex-col gap-5">
                    <input id="task-title" type="text" class="w-full rounded-2xl border dark:border-slate-700 p-5 dark:bg-slate-800 dark:text-white font-bold text-lg" placeholder="Título *">
                    <textarea id="task-desc" class="w-full min-h-[350px] rounded-2xl border dark:border-slate-700 p-5 dark:bg-slate-800 dark:text-white" placeholder="Instruções..."></textarea>
                </div>
                <div class="flex flex-col gap-6">
                    <div><label class="text-[10px] font-black text-slate-400 uppercase">Equipa</label><div id="task-assignees-checkboxes" class="rounded-2xl border dark:border-slate-700 p-4 flex flex-col gap-2 max-h-[200px] overflow-y-auto custom-scrollbar"></div></div>
                    <div><label class="text-[10px] font-black text-slate-400 uppercase">Prioridade</label><select id="task-priority-droplist" class="w-full rounded-xl border dark:border-slate-700 p-4 dark:bg-slate-800 font-bold"><option value="low">Baixa</option><option value="medium" selected>Média</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></div>
                    <div><label class="text-[10px] font-black text-slate-400 uppercase">Prazo</label><input id="task-date" type="date" class="w-full rounded-xl border dark:border-slate-700 p-4 dark:bg-slate-800"></div>
                    <button id="save-task-btn" class="bg-primary text-white py-5 rounded-2xl font-black shadow-lg uppercase text-xs">Criar tarefa</button>
                </div>
            </div>
        </section>

        <section id="page-detalhes" class="page-section px-6 lg:px-40 py-8 text-left"><div id="details-view-content" class="max-w-6xl mx-auto flex flex-col gap-6"></div></section>

        <section id="page-perfil" class="page-section px-6 lg:px-40 py-8 text-center">
            <div class="max-w-2xl mx-auto bg-white dark:bg-slate-900 p-10 rounded-3xl border dark:border-slate-800 shadow-xl">
                <div class="relative w-32 h-32 mx-auto mb-6">
                    <div id="profile-page-avatar" class="w-full h-full rounded-full bg-primary text-white flex items-center justify-center text-4xl font-black bg-cover bg-center border-4 border-white dark:border-slate-800 shadow-md cursor-pointer" onclick="document.getElementById('photo-options-perfil').classList.toggle('hidden')"></div>
                    <div id="photo-options-perfil" class="hidden absolute top-full left-1/2 -translate-x-1/2 mt-2 w-40 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-xl shadow-2xl z-10 overflow-hidden text-left">
                        <button onclick="document.getElementById('profile-upload').click(); document.getElementById('photo-options-perfil').classList.add('hidden')" class="w-full px-4 py-2 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 border-b">Alterar</button>
                        <button onclick="app.removeProfilePhoto()" class="w-full px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50">Remover</button>
                    </div>
                    <input type="file" id="profile-upload" class="hidden" accept="image/*">
                </div>
                <div class="flex flex-col gap-4 text-left">
                    <input id="profile-name-input" type="text" placeholder="Nome Completo" class="rounded-xl border dark:border-slate-700 p-4 dark:text-white">
                    <textarea id="profile-bio-input" placeholder="Biografia" class="rounded-xl border dark:border-slate-700 p-4 dark:text-white min-h-[100px]"></textarea>
                    <div class="flex justify-between items-center mt-4">
                        <button onclick="app.navigate('reset-password')" class="text-sm font-bold text-slate-500 hover:text-primary transition-colors">Segurança</button>
                        <button id="save-profile-btn" class="bg-primary text-white px-10 py-3 rounded-xl font-bold shadow-lg uppercase text-xs">Salvar</button>
                    </div>
                </div>
            </div>
        </section>

        <section id="page-reset-password" class="page-section px-6 lg:px-40 py-8 text-center">
            <div class="max-w-md mx-auto bg-white dark:bg-slate-900 p-10 rounded-3xl border dark:border-slate-800 shadow-xl">
                <h2 class="text-2xl font-black mb-8">Alterar Senha</h2>
                <div class="flex flex-col gap-4">
                    <input id="current-password-input" type="password" placeholder="Senha Atual" class="rounded-xl border-slate-700 p-4 dark:bg-slate-800">
                    <input id="new-password-input" type="password" placeholder="Nova Senha" class="rounded-xl border-slate-700 p-4 dark:bg-slate-800">
                    <input id="confirm-password-input" type="password" placeholder="Confirmar Nova Senha" class="rounded-xl border-slate-700 p-4 dark:bg-slate-800">
                    <button id="submit-change-password" class="bg-primary text-white py-4 rounded-xl font-black shadow-lg">Confirmar</button>
                    <button onclick="app.navigate('perfil')" class="text-slate-500 text-sm font-bold">Voltar</button>
                </div>
            </div>
        </section>
    </main>

    <div id="modal-backdrop" class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] hidden items-center justify-center p-4">
        
        <div id="modal-subtask-form" class="modal-box hidden bg-white dark:bg-slate-900 w-full max-w-xl rounded-3xl shadow-2xl p-8 text-left">
            <h3 id="subtask-form-title" class="text-xl font-black mb-6 uppercase tracking-widest dark:text-white">Subtarefa</h3>
            <div class="flex flex-col gap-4">
                <input id="sub-title-inp" type="text" placeholder="Título *" class="rounded-xl border dark:border-slate-700 bg-transparent p-4 dark:text-white outline-none">
                <textarea id="sub-desc-inp" placeholder="Instruções..." class="rounded-xl border dark:border-slate-700 bg-transparent p-4 dark:text-white min-h-[100px] outline-none"></textarea>
                <div class="grid grid-cols-2 gap-4">
                    <select id="sub-priority-inp" class="rounded-xl border dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-slate-900 dark:text-white outline-none">
                        <option value="low">Baixa</option><option value="medium" selected>Média</option><option value="high">Alta</option><option value="urgent">Urgente</option>
                    </select>
                    <input id="sub-date-inp" type="date" class="rounded-xl border dark:border-slate-700 bg-transparent p-4 dark:text-white outline-none">
                </div>
                <div id="sub-assignees-checkboxes" class="rounded-xl border dark:border-slate-700 p-3 flex flex-col gap-2 max-h-[120px] overflow-y-auto custom-scrollbar"></div>
                <div class="flex justify-end gap-3 mt-6"><button onclick="app.closeModal()" class="px-6 py-2 font-black text-slate-400 uppercase text-[10px]">Cancelar</button><button id="submit-subtask-form" class="bg-primary text-white px-10 py-3 rounded-xl font-black shadow-lg uppercase text-[10px]">Gravar</button></div>
            </div>
        </div>

        <div id="modal-subtask-view" class="modal-box hidden bg-white dark:bg-slate-900 w-full max-w-5xl rounded-2xl shadow-2xl h-[85vh] overflow-hidden flex flex-col text-left">
            <div id="subtask-view-content" class="flex flex-col md:flex-row flex-1 overflow-hidden"></div>
        </div>

        <div id="modal-edit-task" class="modal-box hidden bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl p-8 max-h-[90vh] overflow-y-auto custom-scrollbar text-slate-900 dark:text-slate-100 text-left">
            <h3 class="text-xl font-black mb-8 uppercase tracking-widest">Editar Projeto</h3>
            <div class="flex flex-col gap-4">
                <input id="edit-task-title" type="text" class="rounded-xl border dark:border-slate-700 bg-transparent p-4 dark:text-white font-bold outline-none">
                <textarea id="edit-task-desc" class="rounded-xl border dark:border-slate-700 bg-transparent p-4 dark:text-white min-h-[180px] outline-none"></textarea>
                <div id="edit-assignees-checkboxes" class="rounded-xl border dark:border-slate-700 p-3 flex flex-col gap-2 max-h-[140px] overflow-y-auto"></div>
                <div class="grid grid-cols-2 gap-4"><select id="edit-task-priority" class="rounded-xl border dark:border-slate-700 bg-white dark:bg-slate-800 p-4 dark:text-white outline-none"><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="urgent">Urgente</option></select><input id="edit-task-date" type="date" class="rounded-xl border dark:border-slate-700 bg-transparent p-4 dark:text-white"></div>
                <div class="flex justify-end gap-3 mt-8 border-t dark:border-slate-800 pt-6"><button onclick="app.closeModal()" class="font-black text-slate-400 uppercase text-[10px] px-4">Voltar</button><button id="submit-edit-task" class="bg-primary text-white px-10 py-3 rounded-xl font-black shadow-lg uppercase text-[10px]">Salvar</button></div>
            </div>
        </div>
    </div>

    <script type="module" src="script.js"></script>
</body>
</html>
