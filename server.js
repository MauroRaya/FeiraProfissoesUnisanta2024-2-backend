const supabase = require('./db/supabaseClient');
const express  = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const PORT = 8383;
let faseAtual = 1;

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
app.use(express.static('public'))

app.get('/usuario', async (req, res) => {
    const nome = req.query.nome;

    const { data, error: getError } = await supabase
                                                .from('usuarios')
                                                .select()
                                                .eq('nome', nome)
                                                .single()

    if (getError) {
        console.error('Erro ao tentar buscar o usuario: ', getError.message);
        return res.status(400).json({ error: `Erro ao tentar buscar o usuario: ${getError.message}` });
    }
    
    return res.status(200).json({ infoUsuario: data});
})

app.post('/usuario', async (req, res) => {
    const { nome, senha } = req.body;

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
    if (senha.length < 3) {
        return res.status(500).json({ error: 'Senha precisa ter no minimo 6 caracteres.' });
    }
    if (senha.length > 12) {
        return res.status(500).json({ error: 'Senha precisa ter no maximo 12 caracteres.' });
    }

    // Verifica se o usuário já existe
    const { data: usuarioDB, error: getError } = await supabase
                                                        .from('usuarios')
                                                        .select('senha')
                                                        .eq('nome', nome)
                                                        .single();

    // Essa mensagem de erro do supabase acontece quando não encontra a pessoa no banco
    if (getError && getError.message != 'JSON object requested, multiple (or no) rows returned') {
        console.error('Erro ao buscar o usuário:', getError.message);
        return res.status(500).json({ error: 'Erro ao buscar o usuário.' });
    }

    if (usuarioDB) {
        // Se o usuário já existe, valida a senha
        if (senha !== usuarioDB.senha) {
            return res.status(401).json({ error: 'Nome ou senha incorretos.' });
        }

        return res.sendStatus(200);
    } else {
        // Se o usuário não existir, realiza o cadastro
        const { error: insertError } = await supabase
                                                .from('usuarios')
                                                .insert({ nome, senha });

        if (insertError) {
            console.error('Erro ao tentar inserir o usuário:', insertError.message);
            return res.status(400).json({ error: 'Erro ao tentar inserir o usuário.' });
        }

        return res.sendStatus(200);
    }
});

//post pra esconder info de login da url
app.post('/adm', async (req, res) => {
    const { nome, senha } = req.body;

    if (nome === 'emuitolongo' && senha === 'naolembro') {
        return res.sendStatus(200);
    }

    console.error('Erro ao tentar logar como administrador');
    return res.status(400).json({ error: 'Erro ao tentar logar como administrador' });
})

io.on('connection', (socket) => {
    console.log('Um usuario se conectou');

    socket.emit('faseAtual', faseAtual);

    socket.on('mudarFase', (fase) => {
        faseAtual = fase;
        io.emit('redirecionar', fase);
        console.log(`Redirecionando para fase ${faseAtual}`);
    });
});

server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

//////////////////////////////////////////////////////////////////////
//                                                                  //
//  CODIGO ESCRITO POR: MAURO RAYA FRANCO                           //
//  ULTIMA REVISÃO: 30/09/2024, 12:14                               //
//                                                                  //
//  CODIGO ATUALIZADO POR:                                          //
//  MUDANÇA:                                                        //
//  DATA DA REVISÃO:                                                //
//                                                                  //
// ---------------------------------------------------------------- //
//                                                                  //
//  OBS: PARA RODAR O SERVIDOR COM NODEMON DIGITE:                  //
//  <NPM RUN DEV> ou                                                //
//  <NODEMON SERVER.JS>                                             //
//                                                                  //
//  <NODE SERVER.JS> também funciona, mas sem nodemon               //
//                                                                  //
//  E CONTROL + C finaliza a execução do servidor no terminal       //
//                                                                  //
// :D                                                               //
//                                                                  //
//////////////////////////////////////////////////////////////////////