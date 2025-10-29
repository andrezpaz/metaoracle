const oracledb = require('oracledb');

async function connectionOracle(database) {
    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
    require('dotenv').config();
    let conn;
    if (database === 'iniflex') {
        conn = await oracledb.getConnection({ user: process.env.DB_USER_INIFLEX, password: process.env.DB_PASS_INIFLEX, connectionString: process.env.DB_HOST});
    } else {
        conn = await oracledb.getConnection({ user: process.env.DB_USER, password: process.env.DB_PASS, connectionString: process.env.DB_HOST});
    }
    return conn;
}

async function executeDatabase(database, query, binds = {}, commit = false) {
    let connection;
    try {
        connection = await connectionOracle(database);
        const result = await connection.execute(query,binds);

        if (commit) {
            await connection.commit(); //realiza o commit se o parametro for true
        }
        return result.rows;
    } catch (err) {
        console.log(err);
    } finally {
        if(connection) {
            try {
                await connection.close();
            } catch (err) {
            console.log(err);
            }
        }
    }
}

function selectBrithdayNamesMetadados() {
    let sql = `SELECT to_char(rhpessoas.nascimento,'dd') dia, 
                      rhpessoas.nome, 
                      rhcentroscusto2.descricao40 centrocusto
                 FROM rhcontratos, rhpessoas, rhsetores, rhcentroscusto1, rhcentroscusto2
                WHERE rhcontratos.pessoa                   = rhpessoas.pessoa
                  AND rhcontratos.setor                    = rhsetores.setor
                  AND rhcentroscusto1.centrocusto1         = rhcontratos.centrocusto1
                  AND rhcentroscusto2.centrocusto2         = rhcontratos.centrocusto2
                  AND rhcontratos.situacao                 in (1,2)
                  AND to_char(rhpessoas.nascimento,'mm')   = to_char(add_months(sysdate,+1), 'mm')
             ORDER BY to_char(rhpessoas.nascimento,'dd')`
    return executeDatabase('metadados', sql);
}

function selectNamesMetadados() {
    let sql = `SELECT DISTINCT(REPLACE(rhpessoas.nome, ' ', ''))||'#'||rhcontratos.contrato as note
                 FROM rhcontratos, rhpessoas, rhsetores, rhcentroscusto1, rhcentroscusto2
                WHERE rhcontratos.pessoa                   = rhpessoas.pessoa
                  AND rhcontratos.setor                    = rhsetores.setor
                  AND rhcentroscusto1.centrocusto1         = rhcontratos.centrocusto1
                  AND rhcentroscusto2.centrocusto2         = rhcontratos.centrocusto2
                  AND rhcontratos.situacao                 in (1,2)
                  AND (
                        rhcentroscusto2.centrocusto2         in ( 'BZ10307', 'BZ10218', 'BZ10402', 'BZ10301', 'BZ10310', 
                                                                  'BZ10305', 'BZ10306', 'BZ10309', 'BZ10311', 'BZ10302',
                                                                  'BZ10213', 'BZ10401', 'BZ10201', 'BZ10405')
                     OR rhpessoas.pessoa in (4340) -- para pessoas especificas fora dos centros de custos acima
                     )`
    return executeDatabase('metadados', sql);
}

function selectNamesHiredDay() {
    let sql = `SELECT rhpessoas.nome, rhpessoas.pessoa, rhcontratos.contrato,
                      rhusuarios.nomeusuario,
                      rhcentroscusto2.descricao40 centrocusto,
                      rhcontratos.dataadmissao
                 FROM rhcontratos, rhpessoas, rhusuarios, rhcentroscusto2
                WHERE rhcontratos.situacao          in (1,2)
                  AND rhcontratos.pessoa            = rhpessoas.pessoa
                  AND rhpessoas.empresa             = rhusuarios.empresa
                  AND rhpessoas.pessoa              = rhusuarios.pessoa
                  AND rhcentroscusto2.centrocusto2  = rhcontratos.centrocusto2
                  AND to_date(rhcontratos.dataadmissao, 'dd/mm/yy') = to_date(sysdate, 'dd/mm/yy')`
    return executeDatabase('metadados', sql)
}

function selectNamesFiredDay() {
    let sql = `SELECT rhpessoas.nome, rhpessoas.pessoa, rhcontratos.contrato,
                      rhusuarios.nomeusuario,
                      rhcentroscusto2.descricao40 centrocusto,
                      rhcontratos.datarescisao,
                      rhpessoas.cpf
                 FROM rhcontratos, rhpessoas, rhusuarios, rhcentroscusto2
                WHERE rhcontratos.pessoa            = rhpessoas.pessoa
                  AND rhpessoas.empresa             = rhusuarios.empresa
                  AND rhpessoas.pessoa              = rhusuarios.pessoa
                  AND rhcentroscusto2.centrocusto2  = rhcontratos.centrocusto2
                  AND to_date(rhcontratos.datarescisao, 'dd/mm/yy') = to_date(sysdate, 'dd/mm/yy')`
    return executeDatabase('metadados', sql)
}

function selectNamesMetadadosDisabled(){
    let sql = `SELECT rhcontratos.contrato, rhpessoas.nome, rhpessoas.cpf, rhpessoas.contratosativos  
                 FROM rhcontratos, rhpessoas
                WHERE rhcontratos.pessoa   = rhpessoas.pessoa
                  AND rhcontratos.situacao not in (1,2)
                  AND rhpessoas.pessoa not in (1027, 1777, 1826, 1297)`
    return executeDatabase('metadados', sql)
}

function selectNamesIniflexActives(){
    let sql = `SELECT asdusuario.cpf, asdusuario.nome
                 FROM asdusuario
                WHERE tipo_usuario = 4
                  AND situacao     = 'A'`
    return executeDatabase('iniflex', sql)
}

function selectNamesIniflex(cpf){
    let sql = `SELECT asdusuario.cpf, asdusuario.nome
                 FROM asdusuario
                WHERE asdusuario.cpf =:cpf`
    const binds = {cpf};
    return executeDatabase('iniflex', sql, binds)
}

function changeStatusUserIniflex(cpf, status){
    let commit = true;
    let sql = `UPDATE asdusuario
                  SET asdusuario.situacao = :status
                WHERE asdusuario.cpf = :cpf`;
    const binds = {status, cpf };
    return executeDatabase('iniflex', sql, binds, commit)
}

module.exports = {selectBrithdayNamesMetadados, selectNamesHiredDay, selectNamesFiredDay, 
                  selectNamesMetadados, selectNamesMetadadosDisabled, selectNamesIniflexActives,
                  selectNamesIniflex, changeStatusUserIniflex};