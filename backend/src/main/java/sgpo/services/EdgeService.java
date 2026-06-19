package sgpo.services;

import sgpo.entities.Edge;
import sgpo.exceptions.EdgeNotFoundException;

import java.util.List;

public interface EdgeService {
    List<Edge> findAll();
    Edge findById(String id) throws EdgeNotFoundException;
    Edge create(Edge edge);
    Edge update(String id, Edge edge) throws EdgeNotFoundException;
    void delete(String id) throws EdgeNotFoundException;
}