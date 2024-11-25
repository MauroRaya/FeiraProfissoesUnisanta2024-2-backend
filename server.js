const supabase = require('./db/supabaseClient');
const bcrypt = require('bcrypt');
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');

const PORT = 8383;

let faseAtual = 1;
let contador = 0;
let contadorIniciado = false;

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*', // Altere para um domínio específico em produção
        methods: ['GET', 'POST'], // Métodos permitidos
        allowedHeaders: ['Content-Type'], // Cabeçalhos permitidos
        credentials: true // Se você estiver usando cookies ou autenticação
    }
});

app.use(cors({
    origin: '*', // Altere para um domínio específico em produção
}));
app.use(express.json());
app.use(express.static('public'));

app.get('/usuario', async (req, res) => {
    const nome = req.query.nome;

    const { data, error: getError } = await supabase
                                            .from('usuarios')
                                            .select()
                                            .eq('nome', nome)
                                            .single();

    if (getError) {
        console.error('Erro ao tentar buscar o usuario: ', getError.message);
        return res.status(400).json({ error: `Erro ao tentar buscar o usuario: ${getError.message}` });
    }

    return res.status(200).json({ infoUsuario: data });
});

app.post('/usuario', async (req, res) => {
    // Dados do formulario
    const { nome, senha } = req.body;

    // Validações de entrada
    if (typeof nome !== 'string' || nome.trim().length === 0) {
        return res.status(500).json({ error: 'Nome é de preenchimento obrigatório.' });
    }
    if (nome.length < 3) {
        return res.status(500).json({ error: 'Nome precisa ter no minimo 3 caracteres.' });
    }
    if (nome.length > 12) {
        return res.status(500).json({ error: 'Nome precisa ter no maximo 12 caracteres.' });
    }
    if (typeof senha !== 'string' || senha.trim().length === 0) {
        return res.status(500).json({ error: 'Senha é de preenchimento obrigatório.' });
    }
    if (senha.length < 6) {
        return res.status(500).json({ error: 'Senha precisa ter no minimo 6 caracteres.' });
    }
    if (senha.length > 12) {
        return res.status(500).json({ error: 'Senha precisa ter no maximo 12 caracteres.' });
    }

    // Verifica se o usuário já existe
    const { data: usuarioDB, error: getError } = await supabase
                                                        .from('usuarios')
                                                        .select('salt, hash, esta_online')
                                                        .eq('nome', nome)
                                                        .single();

    // Verifica erros na busca
    if (getError && getError.message !== 'JSON object requested, multiple (or no) rows returned') {
        console.error('Erro ao buscar o usuário:', getError.message);
        return res.status(500).json({ error: 'Erro ao buscar o usuário.' });
    }

    if (usuarioDB) {
        // Verifica se o usuario já esta online
        if (usuarioDB.esta_online) {
            return res.status(403).json({ error: 'Usuário já está logado.' });
        }
        
        // Se o usuário já existe, valida a senha
        const match = await bcrypt.compare(senha, usuarioDB.hash);

        if (!match) {
            return res.status(401).json({ error: 'Nome ou senha incorretos.' });
        }
        
        console.log(`Usuario logado: ${nome}`);
        return res.sendStatus(200);
    } 
    else {
        // Se o usuário não existir, realiza o cadastro
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(senha, salt);

        const { error: insertError } = await supabase
                                                .from('usuarios')
                                                .insert({ nome, salt, hash });

        if (insertError) {
            console.error('Erro ao tentar inserir o usuário:', insertError.message);
            return res.status(400).json({ error: 'Erro ao tentar inserir o usuário.' });
        }

        console.log(`Novo usuario registrado: ${nome}`);
        return res.sendStatus(200);
    }
});

app.put('/usuario', async (req, res) => {
    const { userId, nomeColuna, tempoFase } = req.body;

    console.log('Dados recebidos:', { userId, nomeColuna, tempoFase });

    if (!userId) {
        return res.status(400).json({ error: 'Erro ao tentar alterar usuario. ID não está definido.' });
    }
    if (!nomeColuna) {
        return res.status(400).json({ error: 'Erro ao tentar alterar usuario. Nome da coluna não foi definida.' });
    }
    if (!tempoFase) {
        return res.status(400).json({ error: 'Erro ao tentar alterar usuario. Novo tempo não foi definido.' });
    }

    const { error: updateError } = await supabase
                                            .from('usuarios')
                                            .update({ [nomeColuna]: tempoFase })
                                            .eq('id', userId)

    if (updateError) {
        console.error('Erro ao tentar alterar pontuação do usuário:', updateError.message);
        return res.status(400).json({ error: 'Erro ao tentar alterar pontuação do usuário.' });
    }
})

//post pra esconder info de login da url
app.post('/adm', async (req, res) => {
    const { nome, senha } = req.body;

    if (nome === 'emuitolongo' && senha === 'naolembro') {
        return res.sendStatus(200);
    }

    console.error('Erro ao tentar logar como administrador.');
    return res.status(400).json({ error: 'Erro ao tentar logar como administrador.' });
});

async function atualizarStatusOnline(userId, statusOnline) {
    if (!userId) {
        throw new Error('ID do usuário não está definido.');
    }

    const { error } = await supabase
        .from('usuarios')
        .update({ esta_online: statusOnline })
        .eq('id', userId);

    if (error) {
        console.error('Erro ao tentar alterar status <esta_online> do usuário:', error.message);
        throw new Error('Erro ao tentar alterar status do usuário.');
    }
}

function controlarContador(acao) {
    if (acao === 'iniciar') {
        if (contadorIniciado) return;

        console.log('Iniciando o contador...');
        contador = 0;
        contadorIniciado = true;

        localInterval = setInterval(() => {
            contador++;
            io.emit('atualizarContador', contador);
        }, 1000);
    }
    else if (acao === 'desligar') {
        if (!localInterval) {
            console.log('Contador já está desligado ou não foi iniciado.');
            return;
        }

        console.log('Desligando o contador...');
        clearInterval(localInterval);
        localInterval = null;
        contadorIniciado = false;
    }
}

// Usando sockets para gerenciar a pagina do usuario, e troca de informação do contador
io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId; // Certifique-se de que o userId está sendo passado na conexão

    console.log('Um usuario se conectou.');

    socket.emit('faseAtual', faseAtual);

    // Atualiza status para online
    atualizarStatusOnline(userId, true).catch(error => {
        console.error(error.message);
    });

    socket.on('iniciarContador', () => {
        controlarContador('iniciar');
    });
    
    socket.on('desligarContador', () => {
        controlarContador('desligar');
    });

    // Redireciona para a fase correta se mudar
    socket.on('mudarFase', (fase) => {
        faseAtual = fase;
        io.emit('redirecionar', fase);
        console.log(`Redirecionando para fase ${faseAtual}.`);
    });

    socket.on('disconnect', () => {
        console.log('Um usuario se desconectou.');

        // Atualiza status para offline
        atualizarStatusOnline(userId, false).catch(error => {
            console.error(error.message);
        });
    })
});

server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}.`));