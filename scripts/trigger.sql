DROP TRIGGER IF EXISTS tr_atualizar_estoque;

CREATE TRIGGER tr_atualizar_estoque AFTER INSERT ON movimentacoes_estoque
BEGIN
  UPDATE produtos SET estoque_atual = COALESCE(estoque_atual, 0) - NEW.quantidade
    WHERE id = NEW.produto_id AND NEW.tipo = 'SAÍDA';
  UPDATE produtos SET estoque_atual = COALESCE(estoque_atual, 0) + NEW.quantidade
    WHERE id = NEW.produto_id AND NEW.tipo = 'ENTRADA';
END;
