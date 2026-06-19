package sgpo.services;

import sgpo.entities.Node;
import sgpo.exceptions.NodeNotFoundException;

import java.util.List;

public interface NodeService {
    List<Node> findAll();
    Node findById(String id) throws NodeNotFoundException;
    Node findByCode(String code) throws NodeNotFoundException;
    Node create(Node node);
    Node update(String id, Node node) throws NodeNotFoundException;
    void delete(String id) throws NodeNotFoundException;
}
